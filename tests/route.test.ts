import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  generateCoaching: vi.fn(),
}));

import { AIError, generateCoaching } from "@/lib/ai";
import { POST } from "@/app/api/chat/route";

const mocked = vi.mocked(generateCoaching);

const reply = {
  type: "coaching" as const,
  language: "en" as const,
  acknowledgement: "ack",
  understanding: "und",
  steps: ["one", "two"],
  encouragement: "enc",
  follow_up: { question: "q?" },
};

function post(body: unknown, init: RequestInit = {}) {
  return POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
      ...init,
    }),
  );
}
const userBody = (content: string) => ({ messages: [{ role: "user", content }] });

beforeEach(() => {
  mocked.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/chat - success", () => {
  it("returns the validated coaching reply", async () => {
    mocked.mockResolvedValue(reply);
    const res = await post(userBody("My 5-year-old refuses to sleep and keeps asking for screen time."));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(reply);
    expect(mocked.mock.calls[0][1]).toBe("en");
  });

  it("asks for an Urdu reply for Urdu script input", async () => {
    mocked.mockResolvedValue({ ...reply, language: "ur" });
    await post(userBody("میرا بچہ رات کو سونے سے انکار کرتا ہے، میں کیا کروں؟"));
    expect(mocked.mock.calls[0][1]).toBe("ur");
  });

  it("asks for an Urdu reply for Roman Urdu input", async () => {
    mocked.mockResolvedValue({ ...reply, language: "ur" });
    await post(userBody("mera bacha raat ko sone se inkar karta hai"));
    expect(mocked.mock.calls[0][1]).toBe("ur");
  });
});

describe("POST /api/chat - invalid input (F)", () => {
  it.each([
    ["empty message", userBody("")],
    ["whitespace-only message", userBody("   \n  ")],
    ["message over 1000 chars", userBody("a".repeat(1001))],
    ["no messages", { messages: [] }],
    ["missing body fields", {}],
    ["wrong types", { messages: "hello" }],
    ["last message from assistant", { messages: [{ role: "assistant", content: "hi" }] }],
  ])("rejects %s with 400 and no model call", async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect((await res.json()).type).toBe("error");
    expect(mocked).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await post("{not json");
    expect(res.status).toBe(400);
    expect(mocked).not.toHaveBeenCalled();
  });

  it("rejects an oversized body with 413", async () => {
    const res = await post("x".repeat(200_000));
    expect(res.status).toBe(413);
    expect(mocked).not.toHaveBeenCalled();
  });
});

describe("POST /api/chat - LLM failure or malformed output (G)", () => {
  it("returns a generic 502 when the model output stays invalid, without leaking it", async () => {
    mocked.mockRejectedValue(new AIError("invalid_output", "Model output failed schema validation"));
    const res = await post(userBody("hello"));
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.type).toBe("error");
    expect(JSON.stringify(body)).not.toContain("schema");
  });

  it("returns 502 when the provider fails", async () => {
    mocked.mockRejectedValue(new AIError("api", "Model request failed", 500));
    expect((await post(userBody("hello"))).status).toBe(502);
  });

  it("returns 429 on provider rate limiting", async () => {
    mocked.mockRejectedValue(new AIError("api", "Model request failed", 429));
    expect((await post(userBody("hello"))).status).toBe(429);
  });

  it("returns 500 with a neutral message when the API key is missing", async () => {
    mocked.mockRejectedValue(new AIError("config", "ANTHROPIC_API_KEY is not set"));
    const res = await post(userBody("hello"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("ANTHROPIC_API_KEY");
  });

  it("returns 502 for unexpected errors", async () => {
    mocked.mockRejectedValue(new Error("boom"));
    expect((await post(userBody("hello"))).status).toBe(502);
  });
});
