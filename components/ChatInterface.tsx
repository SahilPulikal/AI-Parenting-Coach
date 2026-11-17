"use client";

import { useEffect, useRef, useState } from "react";
import MessageBubble, { type ChatMessage } from "./MessageBubble";
import {
  MAX_MESSAGE_CHARS,
  type ApiMessage,
  type ChatRequestBody,
  type CoachReply,
} from "@/lib/types";

const SAMPLES = [
  "My 5-year-old refuses to sleep and keeps asking for screen time.",
  "میرا بچہ رات کو سونے سے انکار کرتا ہے، میں کیا کروں؟",
  "My toddler has a meltdown every time we leave the park.",
];

const HISTORY_LIMIT = 6; // most recent messages sent to the server for context
const GENERIC_ERROR = "Something went wrong. Please try again.";

/** Plain-text version of a reply, sent back to the server as conversation context. */
function replyToText(reply: CoachReply): string {
  if (reply.type === "coaching") {
    return [
      reply.acknowledgement,
      reply.understanding,
      ...reply.steps,
      reply.encouragement,
      reply.follow_up.question,
    ].join("\n");
  }
  return [reply.message, ...reply.actions, reply.follow_up].join("\n");
}

function isCoachReply(data: unknown): data is CoachReply {
  const type = (data as { type?: unknown } | null)?.type;
  return (
    type === "coaching" ||
    type === "crisis" ||
    type === "uncertain" ||
    type === "screening_unavailable"
  );
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Once any safety response has been shown, ordinary coaching stays off for this conversation.
  const [safetyLocked, setSafetyLocked] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  function newConversation() {
    setMessages([]);
    setInput("");
    setError(null);
    setSafetyLocked(false);
    setLoading(false);
    inputRef.current?.focus();
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading || safetyLocked) return;
    if (content.length > MAX_MESSAGE_CHARS) {
      setError(`Please keep your message under ${MAX_MESSAGE_CHARS} characters.`);
      return;
    }

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content };
    const history: ApiMessage[] = [...messages, userMessage]
      .slice(-HISTORY_LIMIT)
      .map((m) =>
        m.role === "user"
          ? { role: "user", content: m.content }
          : { role: "assistant", content: replyToText(m.reply) },
      );

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const body: ChatRequestBody = { messages: history, safetyLocked };
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: unknown = await res.json().catch(() => null);

      if (res.ok && isCoachReply(data)) {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "coach", reply: data },
        ]);
        if (data.type !== "coaching") setSafetyLocked(true);
      } else {
        const message = (data as { message?: unknown } | null)?.message;
        throw new Error(typeof message === "string" ? message : GENERIC_ERROR);
      }
    } catch (err) {
      // Roll back the unanswered message and give the text back so nothing is lost.
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      setInput(content);
      setError(err instanceof Error ? err.message : GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex flex-1 flex-col gap-3">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-teal-900">Safe AI Parenting Coach</h1>
          <p className="text-sm text-stone-600">
            Short, practical, non-judgmental parenting ideas, in English or اردو.
          </p>
        </div>
        <button
          type="button"
          onClick={newConversation}
          className="shrink-0 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-teal-700"
        >
          New conversation
        </button>
      </header>

      <div
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="flex min-h-[50vh] flex-1 flex-col gap-3 overflow-y-auto rounded-2xl bg-stone-100/70 p-3 sm:p-4"
      >
        <section className="rounded-2xl bg-white p-4 text-sm shadow-sm ring-1 ring-stone-200">
          <p className="font-semibold">Welcome. Tell me what is on your mind.</p>
          <p className="mt-2 text-stone-700">
            I can offer a few calm, practical ideas for everyday parenting concerns such as
            sleep, screen time, tantrums and routines.
          </p>
          <p className="mt-2 text-stone-700">
            I can&apos;t diagnose, give medical or legal advice, or handle emergencies. If
            someone is in immediate danger, contact your local emergency services now. For
            health or legal questions, please speak to a qualified professional.
          </p>
        </section>

        {empty && (
          <div className="flex flex-wrap gap-2" aria-label="Sample concerns">
            {SAMPLES.map((sample) => (
              <button
                key={sample}
                type="button"
                dir="auto"
                onClick={() => send(sample)}
                disabled={loading}
                className="rounded-full border border-teal-700/30 bg-white px-3 py-1.5 text-start text-sm text-teal-900 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50"
              >
                {sample}
              </button>
            ))}
          </div>
        )}

        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}

        {loading && (
          <div className="flex justify-start" role="status">
            <p className="rounded-2xl bg-white px-4 py-2 text-sm text-stone-600 shadow-sm ring-1 ring-stone-200">
              <span className="inline-flex gap-1" aria-hidden="true">
                <span className="size-1.5 animate-bounce rounded-full bg-teal-600" />
                <span className="size-1.5 animate-bounce rounded-full bg-teal-600 [animation-delay:150ms]" />
                <span className="size-1.5 animate-bounce rounded-full bg-teal-600 [animation-delay:300ms]" />
              </span>
              <span className="ms-2">Thinking…</span>
            </p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
          {error}
        </p>
      )}

      {safetyLocked ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          Coaching is paused for this conversation. Please use the support options above. You
          can start a new conversation at any time.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2"
        >
          <label htmlFor="concern" className="sr-only">
            Describe your parenting concern
          </label>
          <textarea
            id="concern"
            ref={inputRef}
            dir="auto"
            rows={2}
            value={input}
            maxLength={MAX_MESSAGE_CHARS}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Describe your concern in English or Urdu…"
            className="min-h-12 flex-1 resize-none rounded-xl border border-stone-300 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-teal-700"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-xl bg-teal-700 px-4 py-2.5 font-medium text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}
