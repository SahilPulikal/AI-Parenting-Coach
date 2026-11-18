import { z } from "zod";
import { coachReplySchema } from "./schemas";
import { MAX_MESSAGE_CHARS, type ChatMessage } from "./types";

// Pure logic for saved conversations: no browser APIs here, so it is easy to test.

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  safetyLocked: boolean;
}

export const STORAGE_VERSION = 1;
export const MAX_CONVERSATIONS = 50;
const MAX_TITLE_CHARS = 40;

const storedMessageSchema = z.discriminatedUnion("role", [
  z.object({ id: z.string().min(1), role: z.literal("user"), content: z.string().max(MAX_MESSAGE_CHARS) }),
  z.object({ id: z.string().min(1), role: z.literal("coach"), reply: coachReplySchema }),
]);

const storedConversationSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(200),
  messages: z.array(storedMessageSchema).min(1),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
  safetyLocked: z.boolean().optional(),
});

/** True when any coach message is a safety reply (crisis, uncertain or screening unavailable). */
export function hasSafetyReply(messages: ChatMessage[]): boolean {
  return messages.some((m) => m.role === "coach" && m.reply.type !== "coaching");
}

/** Title from the first parent message: whitespace collapsed, cut at a character boundary. */
export function createTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  const text = first && first.role === "user" ? first.content.replace(/\s+/g, " ").trim() : "";
  if (!text) return "New conversation";
  const chars = Array.from(text); // code points, so Urdu and emoji are never cut in half
  return chars.length > MAX_TITLE_CHARS ? chars.slice(0, MAX_TITLE_CHARS).join("").trimEnd() + "…" : text;
}

export function sortConversations(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Adds or updates the conversation with this id. A conversation with no messages is not
 * kept (so a draft whose first message failed leaves nothing behind). updatedAt only moves
 * when the number of messages changes.
 */
export function upsertConversation(
  list: Conversation[],
  next: { id: string; messages: ChatMessage[]; safetyLocked: boolean },
  now: number,
): Conversation[] {
  const others = list.filter((c) => c.id !== next.id);
  if (next.messages.length === 0) return others;

  const existing = list.find((c) => c.id === next.id);
  const changed = !existing || existing.messages.length !== next.messages.length;
  const conversation: Conversation = {
    id: next.id,
    title: existing?.title ?? createTitle(next.messages),
    messages: next.messages,
    createdAt: existing?.createdAt ?? now,
    updatedAt: changed ? now : (existing?.updatedAt ?? now),
    // Once locked, always locked, whatever the caller passes.
    safetyLocked: next.safetyLocked || existing?.safetyLocked === true || hasSafetyReply(next.messages),
  };
  return sortConversations([conversation, ...others]).slice(0, MAX_CONVERSATIONS);
}

export function removeConversation(list: Conversation[], id: string): Conversation[] {
  return list.filter((c) => c.id !== id);
}

/**
 * Reads saved data defensively. Anything missing, corrupted or from an unknown version
 * yields an empty list; individual bad conversations are skipped without losing the rest.
 */
export function parseStored(raw: string | null): Conversation[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof data !== "object" || data === null) return [];
  const { version, conversations } = data as { version?: unknown; conversations?: unknown };
  if (version !== STORAGE_VERSION || !Array.isArray(conversations)) return [];

  const seen = new Set<string>();
  const valid: Conversation[] = [];
  for (const item of conversations) {
    const parsed = storedConversationSchema.safeParse(item);
    if (!parsed.success || seen.has(parsed.data.id)) continue;
    seen.add(parsed.data.id);
    const messages = parsed.data.messages as ChatMessage[];
    valid.push({
      ...parsed.data,
      messages,
      // Derived from the messages too, so editing the saved flag cannot unlock a crisis chat.
      safetyLocked: parsed.data.safetyLocked === true || hasSafetyReply(messages),
    });
  }
  return sortConversations(valid).slice(0, MAX_CONVERSATIONS);
}

export function serialize(list: Conversation[]): string {
  return JSON.stringify({ version: STORAGE_VERSION, conversations: list });
}

/** "Today", "Yesterday", or a short date, using the local calendar day. */
export function relativeDay(timestamp: number, now: number): string {
  const startOfDay = (t: number) => {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const days = Math.round((startOfDay(now) - startOfDay(timestamp)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  const sameYear = new Date(timestamp).getFullYear() === new Date(now).getFullYear();
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
