import { AIError, generateCoaching } from "@/lib/ai";
import { detectLanguage } from "@/lib/language";
import { findLock, recentUserMessages, screenMessages, type ScreenResult } from "@/lib/safety";
import {
  crisisReply,
  medicalReferralReply,
  uncertainReply,
  unavailableReply,
} from "@/lib/safety-responses";
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
  const { messages, safetyLocked } = parsed.data;
  const latest = messages.at(-1)!.content;
  const language = detectLanguage(latest);

  // 2. Safety gate. Nothing below this point runs for a locked, crisis, uncertain or
  //    unscreened message, so ordinary coaching can never answer one.
  //    a) Server-side lock, derived from the submitted history, not from the client's flag.
  const lock = findLock(messages, safetyLocked === true);
  if (lock) return Response.json(lock);

  //    b) Screen the parent's last 3 messages: deterministic rules, then the model classifier.
  //       An unexpected failure here is treated like an unavailable safety check, never as "safe".
  let screening: ScreenResult;
  try {
    screening = await screenMessages(recentUserMessages(messages));
  } catch {
    screening = { outcome: "unavailable", reason: "failure" };
  }

  if (screening.outcome === "crisis") {
    return Response.json(crisisReply(screening.category, screening.language));
  }
  if (screening.outcome === "uncertain") {
    return Response.json(uncertainReply(language));
  }
  if (screening.outcome === "unavailable") {
    console.error(`[chat] safety screening unavailable: ${screening.reason}`);
    if (screening.reason === "config") {
      return error(500, "The coach isn't set up correctly yet. Please contact the site owner.");
    }
    return Response.json(unavailableReply(language));
  }
  // Fail closed: from here on only an explicit "safe" outcome may continue. Anything else,
  // including a result shape this code does not know about, gets the cautious reply.
  if (screening.outcome !== "safe") {
    return Response.json(uncertainReply(language));
  }
  // Everyday health worries get a fixed referral to a professional, never model-written advice.
  if (screening.medical) return Response.json(medicalReferralReply(language));

  // 3. Ordinary coaching, in the language of the parent's latest message. This is the ONLY place
  //    in the app that calls the coaching model, and it is reachable only after the gate above.
  try {
    const reply = await generateCoaching(messages, language);
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
