import { describe, expect, it } from "vitest";
import { chatRequestSchema, coachingSchema } from "@/lib/schemas";

const validCoaching = {
  type: "coaching",
  language: "en",
  acknowledgement: "That sounds exhausting.",
  understanding: "Your child resists bedtime and asks for screens.",
  steps: ["Set a screen cutoff.", "Use a short calm routine."],
  encouragement: "You are doing a good job.",
  follow_up: { question: "What does bedtime look like now?" },
};

describe("coachingSchema", () => {
  it("accepts a valid response", () => {
    expect(coachingSchema.safeParse(validCoaching).success).toBe(true);
  });

  it("drops unknown fields instead of passing them through", () => {
    const result = coachingSchema.parse({ ...validCoaching, diagnosis: "x" });
    expect("diagnosis" in result).toBe(false);
  });

  it.each([
    ["missing follow_up", { ...validCoaching, follow_up: undefined }],
    ["empty follow-up question", { ...validCoaching, follow_up: { question: "  " } }],
    ["missing steps", { ...validCoaching, steps: undefined }],
    ["too few steps", { ...validCoaching, steps: ["only one"] }],
    ["too many steps", { ...validCoaching, steps: ["a", "b", "c", "d", "e"] }],
    ["unsupported language", { ...validCoaching, language: "fr" }],
    ["wrong type", { ...validCoaching, type: "crisis" }],
    ["steps not strings", { ...validCoaching, steps: [1, 2, 3] }],
  ])("rejects %s", (_name, value) => {
    expect(coachingSchema.safeParse(value).success).toBe(false);
  });
});

describe("chatRequestSchema", () => {
  const user = (content: string) => ({ role: "user" as const, content });

  it("accepts a normal request", () => {
    expect(chatRequestSchema.safeParse({ messages: [user("hello")] }).success).toBe(true);
  });

  it.each([
    ["empty message list", { messages: [] }],
    ["empty message", { messages: [user("")] }],
    ["whitespace-only message", { messages: [user("   \n ")] }],
    ["message over 1000 chars", { messages: [user("a".repeat(1001))] }],
    ["too many messages", { messages: Array.from({ length: 13 }, () => user("hi")) }],
    ["last message from assistant", { messages: [user("hi"), { role: "assistant", content: "hello" }] }],
    ["unknown role", { messages: [{ role: "system", content: "x" }] }],
    ["non-string content", { messages: [{ role: "user", content: 5 }] }],
    ["missing messages", {}],
    ["non-boolean safetyLocked", { messages: [user("hi")], safetyLocked: "yes" }],
  ])("rejects %s", (_name, value) => {
    expect(chatRequestSchema.safeParse(value).success).toBe(false);
  });

  it("accepts a message of exactly 1000 chars", () => {
    expect(chatRequestSchema.safeParse({ messages: [user("a".repeat(1000))] }).success).toBe(true);
  });
});
