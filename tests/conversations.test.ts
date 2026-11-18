import { describe, expect, it, vi } from "vitest";
import {
  MAX_CONVERSATIONS,
  createTitle,
  parseStored,
  relativeDay,
  removeConversation,
  serialize,
  upsertConversation,
  type Conversation,
} from "@/lib/conversations";
import { loadConversations, saveConversations } from "@/lib/storage";
import type { ChatMessage, CoachReply } from "@/lib/types";

const coaching: CoachReply = {
  type: "coaching",
  language: "en",
  acknowledgement: "That sounds hard.",
  understanding: "Bedtime is a struggle.",
  steps: ["Step one.", "Step two."],
  encouragement: "You are doing well.",
  follow_up: { question: "What happens at bedtime?" },
};
const crisis: CoachReply = {
  type: "crisis",
  language: "en",
  severity: "high",
  message: "I'm sorry you're facing this.",
  actions: ["Contact local emergency services now."],
  follow_up: "Are you somewhere safe?",
};
const urdu: CoachReply = {
  ...coaching,
  language: "ur",
  acknowledgement: "یہ مشکل ہے۔",
  understanding: "بچہ سونے سے انکار کرتا ہے۔",
  steps: ["معمول بنائیں۔", "اسکرین بند کریں۔"],
  encouragement: "آپ اچھا کر رہے ہیں۔",
  follow_up: { question: "کیا ہوتا ہے؟" },
};

const user = (id: string, content: string): ChatMessage => ({ id, role: "user", content });
const coach = (id: string, reply: CoachReply): ChatMessage => ({ id, role: "coach", reply });

const T0 = new Date(2026, 10, 18, 12, 0).getTime();
const DAY = 86_400_000;

describe("createTitle", () => {
  it("uses the first parent message", () => {
    expect(createTitle([user("1", "Bedtime help"), coach("2", coaching)])).toBe("Bedtime help");
  });
  it("collapses whitespace and truncates long text with an ellipsis", () => {
    const title = createTitle([user("1", "a  b\n" + "x".repeat(100))]);
    expect(title.startsWith("a b x")).toBe(true);
    expect(Array.from(title).length).toBeLessThanOrEqual(41);
    expect(title.endsWith("…")).toBe(true);
  });
  it("does not cut Urdu text in the middle of a character", () => {
    const title = createTitle([user("1", "میرا بچہ رات کو سونے سے انکار کرتا ہے اور موبائل مانگتا ہے بہت زیادہ")]);
    expect(title.endsWith("…")).toBe(true);
    expect(title).not.toContain("�");
  });
  it("falls back when there is no parent message", () => {
    expect(createTitle([])).toBe("New conversation");
  });
});

describe("upsertConversation", () => {
  const msgs1 = [user("1", "Hello")];
  const msgs2 = [...msgs1, coach("2", coaching)];

  it("creates a conversation with title and timestamps", () => {
    const [c] = upsertConversation([], { id: "a", messages: msgs1, safetyLocked: false }, T0);
    expect(c).toMatchObject({ id: "a", title: "Hello", createdAt: T0, updatedAt: T0, safetyLocked: false });
  });

  it("updates in place, bumps updatedAt, keeps title and createdAt, without duplicating", () => {
    const first = upsertConversation([], { id: "a", messages: msgs1, safetyLocked: false }, T0);
    const next = upsertConversation(first, { id: "a", messages: msgs2, safetyLocked: false }, T0 + 1000);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ title: "Hello", createdAt: T0, updatedAt: T0 + 1000 });
    expect(next[0].messages).toHaveLength(2);
  });

  it("does not bump updatedAt when the message count is unchanged", () => {
    const first = upsertConversation([], { id: "a", messages: msgs2, safetyLocked: false }, T0);
    const same = upsertConversation(first, { id: "a", messages: [...msgs2], safetyLocked: false }, T0 + 5000);
    expect(same[0].updatedAt).toBe(T0);
  });

  it("sorts most recently updated first and a second conversation keeps the first", () => {
    let list = upsertConversation([], { id: "a", messages: msgs1, safetyLocked: false }, T0);
    list = upsertConversation(list, { id: "b", messages: [user("9", "Second")], safetyLocked: false }, T0 + 10);
    expect(list.map((c) => c.id)).toEqual(["b", "a"]);
    list = upsertConversation(list, { id: "a", messages: msgs2, safetyLocked: false }, T0 + 20);
    expect(list.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("drops a conversation whose messages became empty (failed first message)", () => {
    const list = upsertConversation([], { id: "a", messages: msgs1, safetyLocked: false }, T0);
    expect(upsertConversation(list, { id: "a", messages: [], safetyLocked: false }, T0 + 1)).toEqual([]);
  });

  it("never unlocks a locked conversation, and locks when a safety reply is present", () => {
    const withCrisis = [...msgs1, coach("2", crisis)];
    const locked = upsertConversation([], { id: "a", messages: withCrisis, safetyLocked: false }, T0);
    expect(locked[0].safetyLocked).toBe(true);
    const again = upsertConversation(locked, { id: "a", messages: withCrisis, safetyLocked: false }, T0 + 1);
    expect(again[0].safetyLocked).toBe(true);
  });

  it("caps the number of saved conversations", () => {
    let list: Conversation[] = [];
    for (let i = 0; i < MAX_CONVERSATIONS + 5; i++) {
      list = upsertConversation(list, { id: `c${i}`, messages: [user("m", `msg ${i}`)], safetyLocked: false }, T0 + i);
    }
    expect(list).toHaveLength(MAX_CONVERSATIONS);
    expect(list[0].id).toBe(`c${MAX_CONVERSATIONS + 4}`);
  });
});

describe("removeConversation", () => {
  it("removes only the given conversation", () => {
    let list = upsertConversation([], { id: "a", messages: [user("1", "A")], safetyLocked: false }, T0);
    list = upsertConversation(list, { id: "b", messages: [user("2", "B")], safetyLocked: false }, T0 + 1);
    expect(removeConversation(list, "a").map((c) => c.id)).toEqual(["b"]);
  });
});

describe("serialize / parseStored round trip", () => {
  it("restores complete message history including Urdu and safety replies", () => {
    const messages = [user("1", "میرا بچہ سونے سے انکار کرتا ہے"), coach("2", urdu), user("3", "help"), coach("4", crisis)];
    const list = upsertConversation([], { id: "a", messages, safetyLocked: true }, T0);
    const restored = parseStored(serialize(list));
    expect(restored).toHaveLength(1);
    expect(restored[0].messages).toEqual(messages);
    expect(restored[0].safetyLocked).toBe(true);
  });

  it("re-locks a conversation containing a safety reply even if the saved flag was edited to false", () => {
    const list = upsertConversation([], { id: "a", messages: [user("1", "x"), coach("2", crisis)], safetyLocked: true }, T0);
    const tampered = JSON.stringify({ version: 1, conversations: [{ ...list[0], safetyLocked: false }] });
    expect(parseStored(tampered)[0].safetyLocked).toBe(true);
  });
});

describe("parseStored handles bad data", () => {
  it.each([
    ["null", null],
    ["empty string", ""],
    ["not JSON", "{oops"],
    ["wrong top-level type", "[1,2]"],
    ["unknown version", JSON.stringify({ version: 99, conversations: [] })],
    ["conversations not an array", JSON.stringify({ version: 1, conversations: "x" })],
  ])("returns an empty list for %s", (_name, raw) => {
    expect(parseStored(raw)).toEqual([]);
  });

  it("skips corrupted conversations but keeps valid ones", () => {
    const good = upsertConversation([], { id: "ok", messages: [user("1", "fine")], safetyLocked: false }, T0)[0];
    const raw = JSON.stringify({
      version: 1,
      conversations: [
        { id: "bad1", title: "x", messages: [], createdAt: 1, updatedAt: 1 },
        { id: "bad2", title: "x", messages: [{ id: "1", role: "coach", reply: { type: "coaching" } }], createdAt: 1, updatedAt: 1 },
        { id: "bad3", title: 5, messages: [], createdAt: "x" },
        "garbage",
        good,
        good, // duplicate id
      ],
    });
    const restored = parseStored(raw);
    expect(restored.map((c) => c.id)).toEqual(["ok"]);
  });
});

describe("relativeDay", () => {
  it("labels today, yesterday and older dates", () => {
    expect(relativeDay(T0, T0)).toBe("Today");
    expect(relativeDay(T0 - DAY, T0)).toBe("Yesterday");
    expect(relativeDay(T0 - 5 * DAY, T0)).not.toMatch(/Today|Yesterday/);
    expect(relativeDay(T0 - 5 * DAY, T0).length).toBeGreaterThan(2);
  });
});

describe("storage", () => {
  const stubStorage = (impl: Partial<Storage>) =>
    vi.stubGlobal("window", { localStorage: impl as Storage });

  it("saves then loads through a working storage", () => {
    const data = new Map<string, string>();
    stubStorage({
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    });
    const list = upsertConversation([], { id: "a", messages: [user("1", "hi")], safetyLocked: false }, T0);
    expect(saveConversations(list)).toBe(true);
    expect(loadConversations()).toHaveLength(1);
    expect(saveConversations([])).toBe(true);
    expect(loadConversations()).toEqual([]);
  });

  it("reports failure instead of throwing when the quota is exceeded", () => {
    stubStorage({
      getItem: () => null,
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    });
    const list = upsertConversation([], { id: "a", messages: [user("1", "hi")], safetyLocked: false }, T0);
    expect(saveConversations(list)).toBe(false);
  });

  it("loads an empty list instead of throwing when storage is blocked", () => {
    stubStorage({
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    expect(loadConversations()).toEqual([]);
  });
});
