import { AIError, generateCoaching } from "@/lib/ai";
import { detectLanguage } from "@/lib/language";
import { chatRequestSchema } from "@/lib/schemas";
import type { ApiErrorBody } from "@/lib/types";

const MAX_BODY_BYTES = 100_000;

function error(status: number, message: string) {
  const body: ApiErrorBody = { type: "error", message };
  return Response.json(body, { status });
}

export async function POST(request: Request) {
  // 1. Basic request validation. Never trust client-side limits.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return error(413, "That request is too large.");

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return error(400, "We couldn't read your message. Please try again.");
  }
  if (raw.length > MAX_BODY_BYTES) return error(413, "That request is too large.");

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return error(400, "We couldn't read your message. Please try again.");
  }

  const parsed = chatRequestSchema.safeParse(json);
  if (!parsed.success) {
    return error(400, "Please enter a message of up to 1000 characters.");
  }
  const { messages } = parsed.data;

  // 2. PHASE 4: safety screening goes here and must run before any coaching call.
  //    Until then this route does NOT screen for crises. Do not use it for real concerns.

  // 3. Ordinary coaching, in the language of the parent's latest message.
  const latest = messages.at(-1)!.content;
  try {
    const reply = await generateCoaching(messages, detectLanguage(latest));
    return Response.json(reply);
  } catch (err) {
    // Log only the kind and status, never message content or model output.
    const kind = err instanceof AIError ? err.kind : "unexpected";
    console.error(`[chat] coaching failed: ${kind}`, err instanceof AIError ? err.status ?? "" : "");

    if (err instanceof AIError && err.kind === "config") {
      return error(500, "The coach isn't set up correctly yet. Please contact the site owner.");
    }
    if (err instanceof AIError && err.status === 429) {
      return error(429, "The coach is very busy right now. Please try again in a moment.");
    }
    if (err instanceof AIError && err.kind === "invalid_output") {
      return error(502, "We couldn't put together a reliable reply. Please try rephrasing or try again.");
    }
    return error(502, "The coach is temporarily unavailable. Please try again.");
  }
}
