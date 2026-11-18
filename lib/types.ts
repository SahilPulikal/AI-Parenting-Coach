// Shared types used by both the API route and the browser UI.

export type Language = "en" | "ur";

export interface CoachingResponse {
  type: "coaching";
  language: Language;
  acknowledgement: string;
  understanding: string;
  steps: string[];
  encouragement: string;
  follow_up: { question: string };
}

/**
 * Safety responses. All three kinds prevent ordinary coaching:
 * - crisis: a safety concern was identified.
 * - uncertain: the screening could not confidently establish the message is safe.
 * - screening_unavailable: the screening service failed (no judgement was made).
 * Only "crisis" may claim that a concern was identified.
 */
export interface SafetyResponse {
  type: "crisis" | "uncertain" | "screening_unavailable";
  language: Language;
  severity?: "high"; // only present for type "crisis"
  message: string;
  actions: string[];
  follow_up: string;
}

export type CoachReply = CoachingResponse | SafetyResponse;

/** Reasons that stop ordinary coaching and trigger a predefined crisis response. */
export const CRISIS_CATEGORIES = [
  "medical_emergency",
  "self_harm",
  "child_abuse",
  "domestic_violence",
  "immediate_danger",
] as const;
export type CrisisCategory = (typeof CRISIS_CATEGORIES)[number];

/** A message as shown in the UI and saved in the browser's localStorage. */
export type ChatMessage =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "coach"; reply: CoachReply };

/** Message shape sent from the browser to /api/chat. */
export interface ApiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequestBody {
  messages: ApiMessage[];
  /** True once this conversation has produced a safety response. */
  safetyLocked?: boolean;
}

export interface ApiErrorBody {
  type: "error";
  message: string;
}

export const MAX_MESSAGE_CHARS = 1000;
