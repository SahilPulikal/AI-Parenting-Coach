import { z } from "zod";
import { MAX_MESSAGE_CHARS } from "./types";

export const languageSchema = z.enum(["en", "ur"]);

const text = (max: number) => z.string().trim().min(1).max(max);

/** Validates what the coaching model returns. Unknown extra fields are dropped. */
export const coachingSchema = z.object({
  type: z.literal("coaching"),
  language: languageSchema,
  acknowledgement: text(400),
  understanding: text(500),
  steps: z.array(text(400)).min(2).max(4),
  encouragement: text(400),
  follow_up: z.object({ question: text(300) }),
});

/**
 * Validates a safety reply read back from localStorage. Safety replies are static
 * templates written by the server, so this only guards against corrupted or edited data.
 */
export const safetyReplySchema = z.object({
  type: z.enum(["crisis", "uncertain", "screening_unavailable"]),
  language: languageSchema,
  severity: z.literal("high").optional(),
  message: text(1000),
  actions: z.array(text(1000)).max(10),
  follow_up: z.string().trim().max(1000),
});

export const coachReplySchema = z.union([coachingSchema, safetyReplySchema]);

/** Request limits. The server never trusts the client to enforce these. */
export const MAX_MESSAGES = 12;
export const MAX_ASSISTANT_CHARS = 4000; // assistant turns are echoed replies, so longer

const messageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), content: text(MAX_MESSAGE_CHARS) }),
  z.object({ role: z.literal("assistant"), content: text(MAX_ASSISTANT_CHARS) }),
]);

export const chatRequestSchema = z
  .object({
    messages: z.array(messageSchema).min(1).max(MAX_MESSAGES),
    safetyLocked: z.boolean().optional(),
  })
  .refine((body) => body.messages.at(-1)?.role === "user", {
    message: "The last message must come from the parent.",
    path: ["messages"],
  });

export type ValidChatRequest = z.infer<typeof chatRequestSchema>;
