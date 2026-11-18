"use client";

import { useEffect, useState } from "react";
import ChatInterface from "./ChatInterface";
import ChatSidebar, { HistoryToggle } from "./ChatSidebar";
import SettingsDialog from "./SettingsDialog";
import { PlusIcon } from "./icons";
import { useTheme } from "./useTheme";
import {
  removeConversation,
  upsertConversation,
  type Conversation,
} from "@/lib/conversations";
import { loadConversations, saveConversations } from "@/lib/storage";
import type { ChatMessage } from "@/lib/types";

const DESKTOP = "(min-width: 768px)";

const secondary =
  "rounded-lg border border-stone-300 bg-surface px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Owns the list of saved conversations and which one is open. The browser's localStorage is
 * read only after mount (never during server rendering) and written whenever the list changes.
 */
export default function ChatApp() {
  const [loaded, setLoaded] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  // May be the id of a draft that has no messages yet and so is not in the list.
  const [activeId, setActiveId] = useState("");
  const [busy, setBusy] = useState(false);
  // Desktop: the history pane is open by default and can be collapsed. Mobile: a drawer, closed by default.
  const [open, setOpen] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  // Used for "Today" / "Yesterday" labels. Starts at 0 because the clock must not be read while
  // prerendering; it is set after load (the sidebar is not shown before that) and on each change.
  const [now, setNow] = useState(0);

  // localStorage only exists in the browser, so it is read after hydration, not during render.
  useEffect(() => {
    const stored = loadConversations();
    /* eslint-disable react-hooks/set-state-in-effect -- one-time load after hydration */
    setConversations(stored);
    setActiveId(stored[0]?.id ?? crypto.randomUUID());
    setNow(Date.now());
    setOpen(window.matchMedia(DESKTOP).matches);
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  /** Updates the list and saves it. Saving happens here, never before the first load. */
  function commit(next: Conversation[]) {
    setConversations(next);
    setSaveFailed(!saveConversations(next));
    setNow(Date.now());
  }

  // Escape closes the mobile drawer (on desktop the pane is part of the page, so it stays).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !window.matchMedia(DESKTOP).matches) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  /** After choosing something in the history, a mobile drawer should get out of the way. */
  function closeIfMobile() {
    if (!window.matchMedia(DESKTOP).matches) setOpen(false);
  }

  const active = conversations.find((c) => c.id === activeId);

  function handleChange(messages: ChatMessage[], safetyLocked: boolean) {
    commit(upsertConversation(conversations, { id: activeId, messages, safetyLocked }, Date.now()));
  }

  function select(id: string) {
    setActiveId(id);
    closeIfMobile();
  }

  function startNew() {
    // Reuse the current draft instead of creating blank conversations.
    if (active) setActiveId(crypto.randomUUID());
    closeIfMobile();
  }

  function remove(id: string) {
    const remaining = removeConversation(conversations, id);
    commit(remaining);
    if (id === activeId) setActiveId(remaining[0]?.id ?? crypto.randomUUID());
  }

  function clearAll() {
    commit([]);
    setActiveId(crypto.randomUUID());
    closeIfMobile();
  }

  if (!loaded) {
    return (
      <p role="status" className="m-auto text-sm text-stone-500">
        Loading…
      </p>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1">
      {open && (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}
      <ChatSidebar
        conversations={conversations}
        activeId={activeId}
        open={open}
        busy={busy}
        now={now}
        saveFailed={saveFailed}
        onSelect={select}
        onNew={startNew}
        onDelete={remove}
        onClearAll={clearAll}
        onClose={() => setOpen(false)}
        onOpenSettings={() => {
          setSettingsOpen(true);
          closeIfMobile();
        }}
      />

      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 py-4 sm:py-6">
        {/* Top bar: always on mobile; on desktop only while the history pane is collapsed. */}
        <div className={`flex items-center gap-2 px-4 sm:px-8 ${open ? "md:hidden" : ""}`}>
          <HistoryToggle open={open} onClick={() => setOpen(!open)} />
          <p className="min-w-0 flex-1 truncate text-lg font-bold text-teal-900">AI Parenting Coach</p>
          <button type="button" onClick={startNew} disabled={busy} className={`${secondary} flex items-center gap-1.5`}>
            <PlusIcon />
            New conversation
          </button>
        </div>
        <ChatInterface
          key={activeId}
          initialMessages={active?.messages ?? []}
          initialSafetyLocked={active?.safetyLocked ?? false}
          onChange={handleChange}
          onBusyChange={setBusy}
        />
      </section>
      <SettingsDialog
        open={settingsOpen}
        theme={theme}
        onThemeChange={setTheme}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
