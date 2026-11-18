import { AIError, SAFETY_MODEL, callModel, parseModelJson, type ModelCall } from "./ai";
import { detectLanguage } from "./language";
import { safetyClassifierSystemPrompt } from "./prompts";
import { classifierSchema } from "./schemas";
import { matchRules } from "./safety-rules";
import { matchStoredSafetyReply, uncertainReply } from "./safety-responses";
import type { ApiMessage, CrisisCategory, Language, SafetyResponse } from "./types";

/**
 * Safety screening, run before any ordinary coaching.
 *
 *   Layer 1: deterministic rules (safety-rules.ts), English / Urdu / Roman Urdu.
 *   Layer 2: a model classifier (Haiku) that judges meaning and conversation context.
 *
 * Neither layer is complete: the rules only know what was written down, and a model can be
 * wrong. So the design is fail-safe: only an explicit, strictly validated, high-confidence
 * "safe" verdict lets ordinary coaching proceed. Anything else (a crisis, doubt, an error,
 * a timeout, malformed output) stops it.
 */

/** How many of the parent's most recent messages are screened together. */
export const SAFETY_WINDOW = 3;
const CLASSIFIER_TIMEOUT_MS = 12_000;

export type ScreenResult =
  | { outcome: "safe"; medical: boolean }
  | { outcome: "crisis"; category: CrisisCategory; language: Language; source: "rules" | "model" }
  | { outcome: "uncertain" }
  | { outcome: "unavailable"; reason: "config" | "failure" };

/** The parent's last few messages, oldest first. Assistant turns are never screened or trusted. */
export function recentUserMessages(messages: ApiMessage[]): string[] {
  return messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .slice(-SAFETY_WINDOW);
}

/** Layer 1. Checks the newest message first. */
export function screenWithRules(userMessages: string[]): ScreenResult | null {
  for (const text of [...userMessages].reverse()) {
    const match = matchRules(text);
    if (match) return { outcome: "crisis", category: match.category, language: match.language, source: "rules" };
  }
  return null;
}

/**
 * Turns raw classifier text into a result. Throws AIError("invalid_output") for anything that
 * is not exactly the expected JSON: it must never be read as "safe".
 */
export function interpretClassification(text: string): ScreenResult {
  const parsed = classifierSchema.safeParse(parseModelJson(text));
  if (!parsed.success) throw new AIError("invalid_output", "Classifier output failed validation");
  const { verdict, category, confidence } = parsed.data;

  if (verdict === "crisis") {
    // The schema guarantees a crisis category here.
    return { outcome: "crisis", category: category as CrisisCategory, language: "en", source: "model" };
  }
  if (verdict === "safe" && confidence === "high") {
    return { outcome: "safe", medical: category === "medical_concern" };
  }
  // A health worry judged "safe" with medium confidence still gets the fixed professional
  // referral. That reply gives no advice and tells the parent when to seek emergency help, so
  // it is a safe answer even if the classifier is a little unsure.
  if (verdict === "safe" && category === "medical_concern" && confidence === "medium") {
    return { outcome: "safe", medical: true };
  }
  // "uncertain", or "safe" without high confidence: not confident enough to proceed.
  return { outcome: "uncertain" };
}

/** Layer 2. Retries once on invalid output only. Provider errors and timeouts are not retried. */
export async function screenWithModel(
  userMessages: string[],
  call: (c: ModelCall) => Promise<string> = callModel,
): Promise<ScreenResult> {
  const request: ModelCall = {
    model: SAFETY_MODEL,
    system: safetyClassifierSystemPrompt(),
    // JSON-encoding keeps the messages as plain data, whatever characters they contain.
    messages: [{ role: "user", content: `Parent messages (oldest first):\n${JSON.stringify(userMessages)}` }],
    maxTokens: 1024,
    effort: "low",
    timeoutMs: CLASSIFIER_TIMEOUT_MS,
    maxRetries: 0,
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return interpretClassification(await call(request));
    } catch (err) {
      lastError = err;
      if (!(err instanceof AIError) || err.kind !== "invalid_output") break;
    }
  }
  const config = lastError instanceof AIError && lastError.kind === "config";
  return { outcome: "unavailable", reason: config ? "config" : "failure" };
}

/** Runs both layers. The model is only called when no deterministic rule has already fired. */
export async function screenMessages(
  userMessages: string[],
  call?: (c: ModelCall) => Promise<string>,
): Promise<ScreenResult> {
  const ruleResult = screenWithRules(userMessages);
  if (ruleResult) return ruleResult;

  const result = await screenWithModel(userMessages, call);
  if (result.outcome === "crisis") {
    // The classifier does not choose a language; answer in the language of the latest message.
    return { ...result, language: detectLanguage(userMessages.at(-1) ?? "") };
  }
  return result;
}

/**
 * Server-side safety lock, derived from the submitted history rather than from the client's
 * word. A conversation is locked when an earlier assistant turn is one of our own crisis or
 * "uncertain" replies. A client that merely claims safetyLocked: true is also locked (that can
 * only make the server more careful). A client claiming false changes nothing.
 *
 * LIMITATION (by design, there is no database): the server keeps no state, so it only knows
 * what the client sends. A deliberately modified client can drop the earlier turns that hold
 * the safety reply and keep sending harmless messages; once the last 3 parent messages
 * no longer mention the crisis, the server cannot know about it. This lock protects honest
 * clients and accidental loss of the flag. It is NOT tamper-proof.
 *
 * Returns the safety reply to show again, or null when the conversation is not locked.
 * ("screening_unavailable" replies never lock: nothing was judged unsafe, and the next
 * message is screened again together with the earlier one.)
 */
export function findLock(messages: ApiMessage[], clientClaimsLocked: boolean): SafetyResponse | null {
  for (const message of [...messages].reverse()) {
    if (message.role !== "assistant") continue;
    const stored = matchStoredSafetyReply(message.content);
    if (stored && stored.type !== "screening_unavailable") return stored;
  }
  if (clientClaimsLocked) {
    const latest = messages.findLast((m) => m.role === "user")?.content ?? "";
    return uncertainReply(detectLanguage(latest));
  }
  return null;
}
