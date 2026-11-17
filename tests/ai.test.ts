import { afterEach, describe, expect, it, vi } from "vitest";
import { AIError, callModel, generateCoaching, parseCoachingResponse, type ModelCall } from "@/lib/ai";

const en = {
  type: "coaching",
  language: "en",
  acknowledgement: "That sounds tiring.",
  understanding: "Bedtime is a struggle.",
  steps: ["Set a screen cutoff.", "Keep a short routine.", "Stay calm and consistent."],
  encouragement: "You are doing well.",
  follow_up: { question: "What happens at bedtime now?" },
};

const ur = {
  type: "coaching",
  language: "ur",
  acknowledgement: "یہ واقعی تھکا دینے والا ہے۔",
  understanding: "آپ کا بچہ رات کو سونے سے انکار کرتا ہے۔",
  steps: ["سونے سے پہلے اسکرین بند کریں۔", "ایک مختصر معمول بنائیں۔"],
  encouragement: "آپ بہت اچھا کر رہے ہیں۔",
  follow_up: { question: "ابھی سونے کے وقت کیا ہوتا ہے؟" },
};

const messages = [{ role: "user" as const, content: "My child won't sleep" }];
const json = (v: unknown) => JSON.stringify(v);

describe("parseCoachingResponse", () => {
  it("parses valid JSON", () => {
    expect(parseCoachingResponse(json(en), "en").steps).toHaveLength(3);
  });

  it("tolerates a markdown code fence", () => {
    expect(parseCoachingResponse("```json\n" + json(en) + "\n```", "en").type).toBe("coaching");
  });

  it("tolerates a sentence around the JSON", () => {
    expect(parseCoachingResponse("Here you go: " + json(en) + " Hope that helps", "en").type).toBe("coaching");
  });

  it("accepts a valid Urdu reply for Urdu", () => {
    expect(parseCoachingResponse(json(ur), "ur").language).toBe("ur");
  });

  it.each([
    ["not JSON at all", "I am sorry, I cannot help."],
    ["truncated JSON", '{"type":"coaching","language":"en","ackn'],
    ["JSON array", "[1,2,3]"],
    ["missing field", json({ ...en, encouragement: undefined })],
    ["wrong shape", json({ hello: "world" })],
    ["wrong language for the request", json(ur)],
  ])("rejects %s with invalid_output", (_name, text) => {
    expect(() => parseCoachingResponse(text, "en")).toThrowError(AIError);
    try {
      parseCoachingResponse(text, "en");
    } catch (e) {
      expect((e as AIError).kind).toBe("invalid_output");
    }
  });

  it("rejects a reply that claims Urdu but is written in English", () => {
    expect(() => parseCoachingResponse(json({ ...en, language: "ur" }), "ur")).toThrowError(AIError);
  });

  it("does not leak raw model output in the error message", () => {
    try {
      parseCoachingResponse("SECRET-MODEL-TEXT", "en");
    } catch (e) {
      expect((e as Error).message).not.toContain("SECRET-MODEL-TEXT");
    }
  });
});

describe("generateCoaching", () => {
  it("returns a validated reply", async () => {
    const call = vi.fn<(c: ModelCall) => Promise<string>>(async () => json(en));
    const reply = await generateCoaching(messages, "en", call);
    expect(reply.follow_up.question).toBeTruthy();
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("asks for the requested language in the system prompt", async () => {
    const call = vi.fn<(c: ModelCall) => Promise<string>>(async () => json(ur));
    await generateCoaching(messages, "ur", call);
    expect(call.mock.calls[0][0].system).toContain("Urdu");
  });

  it("retries once when the first output is invalid, then succeeds", async () => {
    const call = vi.fn<(c: ModelCall) => Promise<string>>().mockResolvedValueOnce("garbage").mockResolvedValueOnce(json(en));
    const reply = await generateCoaching(messages, "en", call);
    expect(reply.type).toBe("coaching");
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("gives up with invalid_output after two bad outputs", async () => {
    const call = vi.fn<(c: ModelCall) => Promise<string>>(async () => "still not json");
    await expect(generateCoaching(messages, "en", call)).rejects.toMatchObject({ kind: "invalid_output" });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("does not retry provider failures", async () => {
    const call = vi.fn<(c: ModelCall) => Promise<string>>(async () => {
      throw new AIError("api", "down", 500);
    });
    await expect(generateCoaching(messages, "en", call)).rejects.toMatchObject({ kind: "api" });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("starts the model conversation with a parent turn", async () => {
    const call = vi.fn<(c: ModelCall) => Promise<string>>(async () => json(en));
    await generateCoaching(
      [{ role: "assistant", content: "earlier reply" }, { role: "user", content: "hi" }],
      "en",
      call,
    );
    expect(call.mock.calls[0][0].messages[0].role).toBe("user");
  });
});

describe("callModel", () => {
  const original = process.env.ANTHROPIC_API_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = original;
  });

  it("fails with a config error when the API key is missing, without calling the network", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      callModel({ model: "m", system: "s", messages, maxTokens: 10, effort: "low" }),
    ).rejects.toMatchObject({ kind: "config" });
  });
});
