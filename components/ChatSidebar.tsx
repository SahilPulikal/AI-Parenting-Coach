"use client";

import { useState } from "react";
import { GearIcon, PlusIcon, TrashIcon } from "./icons";
import { relativeDay, type Conversation } from "@/lib/conversations";

interface Props {
  conversations: Conversation[];
  activeId: string;
  /** Mobile drawer state. On desktop the sidebar is always visible. */
  open: boolean;
  /** True while a reply is loading, so the active conversation cannot change underneath it. */
  busy: boolean;
  /** Current time, passed in so rendering stays pure. */
  now: number;
  saveFailed: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onClose: () => void;
  onOpenSettings: () => void;
}

/** Hamburger button that opens or closes the history pane. */
export function HistoryToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={open ? "Close chat history" : "Open chat history"}
      aria-expanded={open}
      aria-controls="chat-history"
      className="shrink-0 rounded-lg p-2 text-stone-600 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-teal-700"
    >
      <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
      </svg>
    </button>
  );
}

const button =
  "rounded-lg border px-2.5 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50";

export default function ChatSidebar({
  conversations,
  activeId,
  open,
  busy,
  now,
  saveFailed,
  onSelect,
  onNew,
  onDelete,
  onClearAll,
  onClose,
  onOpenSettings,
}: Props) {
  // Which row (or "all") is showing its inline confirmation.
  const [confirming, setConfirming] = useState<string | "all" | null>(null);

  return (
    // Mobile: a drawer that slides in over the page. Desktop: a pane that collapses to zero width.
    // When closed it is `invisible`, so its buttons cannot be reached with the keyboard.
    <aside
      id="chat-history"
      aria-label="Chat history"
      className={`fixed inset-y-0 left-0 z-40 overflow-hidden border-e border-stone-200 bg-surface shadow-xl transition-all duration-200 md:static md:z-auto md:shrink-0 md:translate-x-0 md:shadow-none ${
        open ? "visible translate-x-0 md:w-68" : "invisible -translate-x-full md:w-0 md:border-e-0"
      }`}
    >
      {/* Fixed width inside, so the content does not reflow while the pane animates. */}
      <div className="flex h-full w-68 flex-col">
      <div className="space-y-3 p-3">
        <div className="flex items-center gap-2">
          <HistoryToggle open onClick={onClose} />
          <p className="text-lg font-bold text-teal-900">AI Parenting Coach</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setConfirming(null);
            onNew();
          }}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlusIcon />
          New conversation
        </button>
      </div>

      <h2 className="px-3 pb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">
        Chat History
      </h2>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {conversations.length === 0 ? (
          <p className="px-2 py-4 text-sm text-stone-500">
            No saved conversations yet. Your chats will appear here.
          </p>
        ) : (
          <ul className="space-y-1">
            {conversations.map((c) => {
              const active = c.id === activeId;
              return (
                <li key={c.id}>
                  {confirming === c.id ? (
                    <div className="space-y-2 rounded-lg bg-red-50 p-2 ring-1 ring-red-200">
                      <p className="text-sm text-red-900">Delete this conversation?</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setConfirming(null);
                            onDelete(c.id);
                          }}
                          className={`${button} border-red-700 bg-red-700 text-white hover:bg-red-800`}
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(null)}
                          className={`${button} border-stone-300 bg-surface text-stone-700 hover:bg-stone-100`}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`group flex items-center rounded-lg ${
                        active ? "bg-teal-50 ring-1 ring-teal-700/30" : "hover:bg-stone-100"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(c.id)}
                        disabled={busy}
                        aria-current={active ? "true" : undefined}
                        className="min-w-0 flex-1 rounded-lg px-2.5 py-2 text-start focus-visible:outline-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed"
                      >
                        <span dir="auto" className="block truncate text-sm font-medium text-stone-800">
                          {c.title}
                        </span>
                        <span className="block text-xs text-stone-500">
                          {relativeDay(c.updatedAt, now)}
                          {c.safetyLocked && " · Support options shown"}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(c.id)}
                        disabled={busy}
                        aria-label={`Delete conversation: ${c.title}`}
                        className="me-1 rounded-md p-1.5 text-stone-400 hover:bg-stone-200 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-2 border-t border-stone-200 p-3">
        {saveFailed && (
          <p role="alert" className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900 ring-1 ring-amber-200">
            This browser couldn&apos;t save your chats (storage may be full or blocked). They still
            work now but may not be here next time.
          </p>
        )}
        {conversations.length > 0 &&
          (confirming === "all" ? (
            <div className="space-y-2 rounded-lg bg-red-50 p-2 ring-1 ring-red-200">
              <p className="text-sm text-red-900">Delete all saved conversations?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(null);
                    onClearAll();
                  }}
                  className={`${button} border-red-700 bg-red-700 text-white hover:bg-red-800`}
                >
                  Delete all
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  className={`${button} border-stone-300 bg-surface text-stone-700 hover:bg-stone-100`}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming("all")}
              disabled={busy}
              className={`${button} flex w-full items-center gap-2 border-stone-300 bg-surface text-stone-700 hover:bg-stone-100`}
            >
              <TrashIcon />
              Clear all history
            </button>
          ))}
        <button
          type="button"
          onClick={onOpenSettings}
          className={`${button} flex w-full items-center gap-2 border-stone-300 bg-surface text-stone-700 hover:bg-stone-100`}
        >
          <GearIcon />
          Settings
        </button>
        <p className="text-xs text-stone-500">
          Chats are saved only in this browser on this device, and deleting them here removes
          that copy. Messages are still sent to an AI service to generate each reply.
        </p>
      </div>
      </div>
    </aside>
  );
}
