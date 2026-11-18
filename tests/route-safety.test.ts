import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  generateCoaching: vi.fn(),
  callModel: vi.fn(), // the safety classifier (Haiku)
}));

import { AIError, callModel, generateCoaching } from "@/lib/ai";
import { POST } from "@/app/api/chat/route";
import { hasUrduScript } from "@/lib/language";
import { crisisReply, uncertainReply, unavailableReply } from "@/lib/safety-responses";
import { english, romanUrdu, urdu } from "./fixtures/crisis-cases";

const classifier = vi.mocked(callModel);
const coaching = vi.mocked(generateCoaching);

const coachingReply = {
  type: "coaching" as const,
  language: "en" as const,
  acknowledgement: "MODEL-WRITTEN acknowledgement",
  understanding: "u",
  steps: ["one", "two"],
  encouragement: "e",
  follow_up: { question: "q?" },
};

const verdict = (v: string, c: string, conf = "high") => JSON.stringify({ verdict: v, category: c, confidence: conf });
const SAFE = verdict("safe", "none");

type Msg = { role: "user" | "assistant"; content: string };
const user = (content: string): Msg => ({ role: "user", content });
const assistant = (content: string): Msg => ({ role: "assistant", content });
const asText = (r: { message: string; actions: string[]; follow_up: string }) =>
  [r.message, ...r.actions, r.follow_up].join("\n");

async function send(messages: Msg[], extra: Record<string, unknown> = {}) {
  const res = await POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages, ...extra }),
    }),
  );
  return { status: res.status, body: await res.json() };
}

/** The coaching model must not have been used, and the reply must be one of ours. */
function expectNoCoaching() {
  expect(coaching).not.toHaveBeenCalled();
}

beforeEach(() => {
  coaching.mockReset().mockResolvedValue(coachingReply);
  classifier.mockReset().mockResolvedValue(SAFE);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("A-C. ordinary concerns reach the coach after screening", () => {
  it.each([
    ["English", "My 5-year-old refuses to sleep and keeps asking for screen time.", "en"],
    ["Urdu", "میرا بچہ رات کو سونے سے انکار کرتا ہے، میں کیا کروں؟", "ur"],
    ["Roman Urdu", "mera bacha raat ko sone se inkar karta hai aur phone mangta hai, main kya karun?", "ur"],
  ])("%s concern: screened, then coached in the right language", async (_n, text, language) => {
    const { status, body } = await send([user(text)]);
    expect(status).toBe(200);
    expect(body.type).toBe("coaching");
    expect(classifier).toHaveBeenCalledTimes(1);
    expect(coaching).toHaveBeenCalledTimes(1);
    expect(coaching.mock.calls[0][1]).toBe(language);
  });
});

describe("a crisis message can never reach the coaching model", () => {
  const all = [...english, ...urdu, ...romanUrdu];

  it.each(all)("%s -> predefined %s reply, no classifier, no coaching", async (text, category) => {
    const { status, body } = await send([user(text)]);
    expect(status).toBe(200);
    expect(body.type).toBe("crisis");
    expect(body).toEqual(crisisReply(category, body.language));
    expect(classifier).not.toHaveBeenCalled();
    expect(coaching).not.toHaveBeenCalled();
  });

  it("holds even when the classifier would have said the message is safe (rules run first)", async () => {
    classifier.mockResolvedValue(SAFE);
    for (const [text] of all.slice(0, 20)) {
      expect((await send([user(text)])).body.type).toBe("crisis");
    }
    expect(coaching).not.toHaveBeenCalled();
  });

  it("holds when the crisis sentence is the earliest of the last three parent messages", async () => {
    for (const [text] of all) {
      const { body } = await send([user(text), assistant("ok"), user("thanks"), assistant("ok"), user("and about homework?")]);
      expect(body.type).toBe("crisis");
    }
    expect(coaching).not.toHaveBeenCalled();
  });
});

describe("explicit medical emergency", () => {
  it("returns the predefined crisis reply immediately: no classifier, no coaching", async () => {
    const { status, body } = await send([user("My child is unconscious and not responding.")]);
    expect(status).toBe(200);
    expect(body).toEqual(crisisReply("medical_emergency", "en"));
    expect(body.severity).toBe("high");
    expect(classifier).not.toHaveBeenCalled();
    expectNoCoaching();
  });

  it("works in Urdu and Roman Urdu with Urdu replies", async () => {
    for (const text of ["بچہ بے ہوش ہے اور سانس نہیں لے رہا", "mera bacha behosh hai aur saans nahi le raha"]) {
      const { body } = await send([user(text)]);
      expect(body).toEqual(crisisReply("medical_emergency", "ur"));
      expect(hasUrduScript(body.message)).toBe(true);
    }
    expectNoCoaching();
  });
});

describe("medical concern without clear emergency signs", () => {
  const ask = "My son has a fever and a rash. Which medicine and what dose should I give him?";

  it("is not treated as an emergency: fixed professional referral, no model-written advice", async () => {
    classifier.mockResolvedValue(verdict("safe", "medical_concern"));
    const { body } = await send([user(ask)]);
    expect(body.type).toBe("coaching");
    expect(JSON.stringify(body)).toMatch(/doctor/i);
    expect(JSON.stringify(body)).not.toMatch(/\d|paracetamol|ibuprofen|mg\b/i);
    expect(coaching).not.toHaveBeenCalled(); // the coaching model never writes medical replies
    expect(body.type).not.toBe("crisis");
  });

  it("does not lock the conversation: the next ordinary message is coached", async () => {
    classifier.mockResolvedValue(verdict("safe", "medical_concern"));
    const first = await send([user(ask)]);
    classifier.mockResolvedValue(SAFE);
    const history = [
      user(ask),
      assistant([first.body.acknowledgement, ...first.body.steps].join("\n")),
      user("Thanks. Separately, how do I handle bedtime fights?"),
    ];
    const second = await send(history);
    expect(second.body.type).toBe("coaching");
    expect(coaching).toHaveBeenCalledTimes(1);
  });

  it("escalates urgently when the classifier sees severe symptoms", async () => {
    classifier.mockResolvedValue(verdict("crisis", "medical_emergency"));
    const { body } = await send([user("She has a high fever, is floppy and very hard to rouse")]);
    expect(body).toEqual(crisisReply("medical_emergency", "en"));
    expectNoCoaching();
  });

  it("answers in Urdu for an Urdu medical question", async () => {
    classifier.mockResolvedValue(verdict("safe", "medical_concern"));
    const { body } = await send([user("بچے کو بخار اور دانے ہیں، کون سی دوا کتنی دوں؟")]);
    expect(body.language).toBe("ur");
    expect(hasUrduScript(JSON.stringify(body))).toBe(true);
  });
});

describe("abuse, domestic violence and self-harm: predefined replies only", () => {
  const cases: [string, string, "child_abuse" | "domestic_violence" | "self_harm", "en" | "ur"][] = [
    ["child abuse (E)", "I'm afraid someone at home may hurt my child.", "child_abuse", "en"],
    ["child abuse (Urdu)", "مجھے ڈر ہے کہ گھر میں کوئی میرے بچے کو نقصان پہنچائے گا", "child_abuse", "ur"],
    ["child abuse (Roman Urdu)", "mujhe dar hai ke koi mere bache ko nuksan pohanchaye", "child_abuse", "ur"],
    ["domestic violence", "My husband beats me and I am scared", "domestic_violence", "en"],
    ["domestic violence (Urdu)", "میرا شوہر مجھے مارتا ہے", "domestic_violence", "ur"],
    ["domestic violence (Roman Urdu)", "shauhar mujhay marta hai", "domestic_violence", "ur"],
    ["self-harm (D)", "I feel like hurting myself and I don't know what to do.", "self_harm", "en"],
    ["self-harm (Urdu)", "میں خود کو نقصان پہنچانا چاہتا ہوں", "self_harm", "ur"],
    ["self-harm (Roman Urdu)", "main khudkushi karna chahti hoon", "self_harm", "ur"],
  ];

  it.each(cases)("%s", async (_n, text, category, language) => {
    const { status, body } = await send([user(text)]);
    expect(status).toBe(200);
    expect(body).toEqual(crisisReply(category, language)); // exactly the fixed text
    expect(classifier).not.toHaveBeenCalled();
    expectNoCoaching();
  });

  it("a model-detected crisis (no keyword) also gets the fixed reply, not model text", async () => {
    classifier.mockResolvedValue(verdict("crisis", "child_abuse"));
    const { body } = await send([user("He keeps going into her room at night and she has stopped talking to me")]);
    expect(body).toEqual(crisisReply("child_abuse", "en"));
    expectNoCoaching();
  });
});

describe("crisis disclosed in an earlier turn", () => {
  it("is still caught when a later message looks ordinary (rules)", async () => {
    const { body } = await send([
      user("My husband beats me"),
      assistant("Placeholder earlier assistant text"),
      user("Anyway, my son won't brush his teeth. Any tips?"),
    ]);
    expect(body.type).toBe("crisis");
    expectNoCoaching();
  });

  it("is still caught by the classifier, which is given the earlier message", async () => {
    classifier.mockResolvedValue(verdict("crisis", "child_abuse"));
    const vague = "Some things happen at night that I don't want to say out loud";
    const { body } = await send([user(vague), assistant("earlier"), user("What about bedtime stories?")]);
    expect(body.type).toBe("crisis");
    expect(classifier.mock.calls[0][0].messages[0].content).toContain(vague);
    expectNoCoaching();
  });
});

describe("classifier failure: nothing proceeds to coaching", () => {
  it("timeout or provider error -> screening_unavailable (not a crisis)", async () => {
    classifier.mockRejectedValue(new AIError("api", "timed out"));
    const { status, body } = await send([user("My toddler won't eat vegetables")]);
    expect(status).toBe(200);
    expect(body).toEqual(unavailableReply("en"));
    expect(body.type).toBe("screening_unavailable");
    expect(JSON.stringify(body)).not.toMatch(/crisis|detected/i);
    expectNoCoaching();
  });

  it.each([
    ["not JSON", "Looks fine to me!"],
    ["unknown category", verdict("crisis", "bullying")],
    ["contradictory", verdict("safe", "self_harm")],
    ["extra fields", JSON.stringify({ verdict: "safe", category: "none", confidence: "high", x: 1 })],
  ])("invalid classifier output (%s) -> screening_unavailable", async (_n, text) => {
    classifier.mockResolvedValue(text);
    const { body } = await send([user("My toddler won't eat vegetables")]);
    expect(body.type).toBe("screening_unavailable");
    expectNoCoaching();
  });

  it("uses the parent's language for the unavailable notice", async () => {
    classifier.mockRejectedValue(new AIError("api", "down"));
    const { body } = await send([user("میرا بچہ سبزی نہیں کھاتا")]);
    expect(body).toEqual(unavailableReply("ur"));
  });

  it("an unsure classifier -> 'uncertain' (calm, not a crisis claim)", async () => {
    classifier.mockResolvedValue(verdict("uncertain", "none", "low"));
    const { body } = await send([user("It happened again")]);
    expect(body).toEqual(uncertainReply("en"));
    expect(body.type).toBe("uncertain");
    expectNoCoaching();
  });

  it("'safe' without high confidence is treated as uncertain", async () => {
    classifier.mockResolvedValue(verdict("safe", "none", "medium"));
    const { body } = await send([user("It happened again")]);
    expect(body.type).toBe("uncertain");
    expectNoCoaching();
  });

  it("the unavailable notice does not lock: the next message is screened again, together with the first", async () => {
    classifier.mockRejectedValueOnce(new AIError("api", "down"));
    const first = await send([user("My toddler won't eat vegetables")]);
    expect(first.body.type).toBe("screening_unavailable");

    classifier.mockResolvedValue(SAFE);
    const second = await send([
      user("My toddler won't eat vegetables"),
      assistant(asText(first.body)),
      user("Sorry, trying again"),
    ]);
    expect(second.body.type).toBe("coaching");
    expect(classifier.mock.calls.at(-1)![0].messages[0].content).toContain("My toddler won't eat vegetables");
  });

  it("a missing API key is a configuration error, not a safety verdict", async () => {
    classifier.mockRejectedValue(new AIError("config", "no key"));
    const { status, body } = await send([user("hello there")]);
    expect(status).toBe(500);
    expect(body.type).toBe("error");
    expectNoCoaching();
  });

  it("the rules still protect when the classifier is down", async () => {
    classifier.mockRejectedValue(new AIError("api", "down"));
    const { body } = await send([user("My husband beats me")]);
    expect(body).toEqual(crisisReply("domestic_violence", "en"));
  });
});

describe("attempts to bypass the client safety lock", () => {
  const crisisHistory = (): Msg[] => {
    const earlier = crisisReply("self_harm", "en");
    return [user("hmm"), assistant(asText(earlier)), user("OK. Now how do I get my kid to do homework?")];
  };

  it("safetyLocked: true is honoured without any model call", async () => {
    const { body } = await send([user("How do I get my kid to do homework?")], { safetyLocked: true });
    expect(body.type).toBe("uncertain");
    expect(classifier).not.toHaveBeenCalled();
    expectNoCoaching();
  });

  it("safetyLocked: false does not unlock a conversation whose history holds our crisis reply", async () => {
    const { body } = await send(crisisHistory(), { safetyLocked: false });
    expect(body).toEqual(crisisReply("self_harm", "en"));
    expect(classifier).not.toHaveBeenCalled();
    expectNoCoaching();
  });

  it("omitting the flag does not unlock either", async () => {
    const { body } = await send(crisisHistory());
    expect(body.type).toBe("crisis");
    expectNoCoaching();
  });

  it("an 'uncertain' lock in the history also holds", async () => {
    const history = [user("x"), assistant(asText(uncertainReply("en"))), user("normal question")];
    const { body } = await send(history, { safetyLocked: false });
    expect(body.type).toBe("uncertain");
    expectNoCoaching();
  });

  it("an Urdu crisis reply in the history keeps its (Urdu) guidance", async () => {
    const earlier = crisisReply("domestic_violence", "ur");
    const { body } = await send([user("x"), assistant(asText(earlier)), user("بچہ ہوم ورک نہیں کرتا")], { safetyLocked: false });
    expect(body).toEqual(earlier);
  });

  it("dropping the earlier crisis reply from the history does not hide a recent disclosure", async () => {
    const { body } = await send([user("I want to kill myself"), user("never mind, what about homework?")], { safetyLocked: false });
    expect(body.type).toBe("crisis");
    expectNoCoaching();
  });

  it("a forged flag cannot make an unsafe message safe: the flag only ever adds caution", async () => {
    const { body } = await send([user("My child is unconscious")], { safetyLocked: false });
    expect(body.type).toBe("crisis");
  });
});

describe("response never carries ordinary coaching text for safety outcomes", () => {
  it("none of the safety replies contain the (mocked) model-written text", async () => {
    const texts: string[] = [];
    texts.push(JSON.stringify((await send([user("I want to die")])).body));
    texts.push(JSON.stringify((await send([user("x")], { safetyLocked: true })).body));
    classifier.mockResolvedValue(verdict("uncertain", "none", "low"));
    texts.push(JSON.stringify((await send([user("It happened again")])).body));
    for (const text of texts) expect(text).not.toContain("MODEL-WRITTEN");
    expectNoCoaching();
  });
});
