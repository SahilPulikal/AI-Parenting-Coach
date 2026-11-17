import Anthropic from "@anthropic-ai/sdk";
import { hasUrduScript } from "./language";
import { coachingSystemPrompt } from "./prompts";
import { coachingSchema } from "./schemas";
import type { ApiMessage, CoachingResponse, Language } from "./types";

// Server-side only. The API key is read from the environment and never sent to the browser.
const COACH_MODEL = process.env.ANTHROPIC_COACH_MODEL ?? "claude-sonnet-5-5";
export const SAFETY_MODEL = process.env.ANTHROPIC_SAFETY_MODEL ?? "claude-haiku-5-5";

export type AIErrorKind =
  | "config" //         API key missing
  | "api" //            network, auth, rate limit or server error from the provider
  | "refused" //        the provider declined to answer
  | "invalid_output"; // model output was empty, truncated, not JSON, or failed validation

/** The only error type the route has to understand. Messages never contain model output. */
export class AIError extends Error {
  constructor(
    public kind: AIErrorKind,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "AIError";
  }
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AIError("config", "ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 });
  return client;
}

export interface ModelCall {
  model: string;
  system: string;
  messages: ApiMessage[];
  maxTokens: number;
  effort: "low" | "medium" | "high";
}

/** Makes one model request and returns its text. Throws AIError on any failure. */
export async function callModel(call: ModelCall): Promise<string> {
  let response: Anthropic.Message;
  try {
    response = await getClient().messages.create({
      model: call.model,
      max_tokens: call.maxTokens, // thinking tokens count toward this, so keep it generous
      system: call.system,
      messages: call.messages,
      output_config: { effort: call.effort },
    });
  } catch (err) {
    if (err instanceof AIError) throw err;
    const status = err instanceof Anthropic.APIError ? err.status : undefined;
    throw new AIError("api", "Model request failed", status);
  }

  if (response.stop_reason === "refusal") throw new AIError("refused", "Model declined to answer");
  if (response.stop_reason === "max_tokens") throw new AIError("invalid_output", "Model output was truncated");

  const text = response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim();
  if (!text) throw new AIError("invalid_output", "Model returned no text");
  return text;
}

/** Extracts a JSON value from model text, tolerating a markdown code fence around it. */
export function parseModelJson(text: string): unknown {
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(unfenced);
  } catch {
    // Last resort: the outermost braces, in case the model added a sentence around the JSON.
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start === -1 || end <= start) throw new AIError("invalid_output", "Model output was not JSON");
    try {
      return JSON.parse(unfenced.slice(start, end + 1));
    } catch {
      throw new AIError("invalid_output", "Model output was not valid JSON");
    }
  }
}

/** Validates raw model text as a coaching response in the expected language. */
export function parseCoachingResponse(text: string, language: Language): CoachingResponse {
  const result = coachingSchema.safeParse(parseModelJson(text));
  if (!result.success) throw new AIError("invalid_output", "Model output failed schema validation");
  const reply = result.data;

  if (reply.language !== language) {
    throw new AIError("invalid_output", "Model replied in the wrong language");
  }
  if (language === "ur") {
    // The "language" field is self-reported, so also check the text really is Urdu script.
    const body = [reply.acknowledgement, reply.understanding, ...reply.steps, reply.follow_up.question].join(" ");
    if (!hasUrduScript(body)) throw new AIError("invalid_output", "Urdu reply was not in Urdu script");
  }
  return reply;
}

/** Conversation context for the model: starts with a parent turn, as the API requires. */
function toModelMessages(messages: ApiMessage[]): ApiMessage[] {
  const firstUser = messages.findIndex((m) => m.role === "user");
  return firstUser === -1 ? [] : messages.slice(firstUser);
}

/**
 * Generates a validated coaching reply. Retries once if the output is invalid; after that
 * throws AIError so the caller can show a generic message. Raw output is never returned.
 * `call` is injectable so tests can run without the network.
 */
export async function generateCoaching(
  messages: ApiMessage[],
  language: Language,
  call: (c: ModelCall) => Promise<string> = callModel,
): Promise<CoachingResponse> {
  const request: ModelCall = {
    model: COACH_MODEL,
    system: coachingSystemPrompt(language),
    messages: toModelMessages(messages),
    maxTokens: 4096,
    effort: "medium",
  };

  let lastError: AIError | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return parseCoachingResponse(await call(request), language);
    } catch (err) {
      if (!(err instanceof AIError)) throw err;
      lastError = err;
      if (err.kind !== "invalid_output") throw err; // only bad output is worth retrying
    }
  }
  throw lastError ?? new AIError("invalid_output", "Model output was invalid");
}
