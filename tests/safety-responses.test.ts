import { describe, expect, it } from "vitest";
import { hasUrduScript } from "@/lib/language";
import {
  crisisReply,
  matchStoredSafetyReply,
  medicalReferralReply,
  uncertainReply,
  unavailableReply,
} from "@/lib/safety-responses";
import { coachingSchema, safetyReplySchema } from "@/lib/schemas";
import { CRISIS_CATEGORIES, type Language } from "@/lib/types";

const languages: Language[] = ["en", "ur"];
const asText = (r: { message: string; actions: string[]; follow_up: string }) =>
  [r.message, ...r.actions, r.follow_up].join("\n");

const everySafetyReply = languages.flatMap((language) => [
  ...CRISIS_CATEGORIES.map((c) => ({ name: `crisis/${c}/${language}`, reply: crisisReply(c, language) })),
  { name: `uncertain/${language}`, reply: uncertainReply(language) },
  { name: `unavailable/${language}`, reply: unavailableReply(language) },
]);

describe("predefined safety replies", () => {
  it.each(everySafetyReply)("$name matches the safety schema and is in the right language", ({ reply }) => {
    expect(safetyReplySchema.safeParse(reply).success).toBe(true);
    expect(hasUrduScript(asText(reply))).toBe(reply.language === "ur");
  });

  it("crisis replies are marked high severity; the others carry no severity", () => {
    for (const c of CRISIS_CATEGORIES) {
      expect(crisisReply(c, "en")).toMatchObject({ type: "crisis", severity: "high" });
    }
    expect(uncertainReply("en").severity).toBeUndefined();
    expect(unavailableReply("en").severity).toBeUndefined();
  });

  it("every crisis reply points to emergency services or a trusted person", () => {
    for (const c of CRISIS_CATEGORIES) {
      expect(crisisReply(c, "en").actions.join(" ")).toMatch(/emergency|trust/i);
      expect(crisisReply(c, "ur").actions.join(" ")).toMatch(/ایمرجنسی|قابلِ اعتماد/);
    }
  });

  it("never claims that anyone has been contacted, and has no phone numbers", () => {
    for (const { reply } of everySafetyReply) {
      const text = asText(reply);
      expect(text).not.toMatch(/\d{3}/); // numbers differ by country
      expect(text).not.toMatch(/\b(?:i|we) (?:have |'ve )?(?:called|contacted|notified|alerted|dispatched)\b/i);
    }
  });

  it("does not investigate, blame or diagnose", () => {
    for (const { reply } of everySafetyReply) {
      expect(reply.message.toLowerCase()).not.toMatch(/\byour fault\b|\bdiagnos/);
      // Only one gentle safety question (or none) is asked.
      expect((asText(reply).match(/\?/g) ?? []).length).toBeLessThanOrEqual(1);
    }
  });

  it("'uncertain' and 'screening_unavailable' never tell the parent a crisis was detected", () => {
    for (const language of languages) {
      for (const reply of [uncertainReply(language), unavailableReply(language)]) {
        expect(reply.type).not.toBe("crisis");
        expect(reply.severity).toBeUndefined();
        expect(asText(reply)).not.toMatch(/crisis|detected|identified|بحران/i);
      }
    }
    expect(unavailableReply("en").message).toMatch(/couldn't complete my safety check/i);
    expect(unavailableReply("en").message).toMatch(/isn't a judgment/i);
  });

  it("every reply message is unique, so a stored reply can be recognised unambiguously", () => {
    const messages = everySafetyReply.map((r) => r.reply.message);
    expect(new Set(messages).size).toBe(messages.length);
  });

  it("matchStoredSafetyReply recognises each reply from its text and nothing else", () => {
    for (const { reply } of everySafetyReply) {
      expect(matchStoredSafetyReply(asText(reply))).toEqual(reply);
    }
    expect(matchStoredSafetyReply("A normal coaching reply about bedtime routines.")).toBeNull();
  });
});

describe("fixed medical referral reply", () => {
  it.each(languages)("is a valid coaching-shaped reply (%s)", (language) => {
    const reply = medicalReferralReply(language);
    expect(coachingSchema.safeParse(reply).success).toBe(true);
    expect(reply.type).toBe("coaching");
    expect(hasUrduScript(JSON.stringify(reply))).toBe(language === "ur");
  });

  it("refers to a professional and escalates for worsening symptoms", () => {
    const text = JSON.stringify(medicalReferralReply("en"));
    expect(text).toMatch(/doctor/i);
    expect(text).toMatch(/emergency services/i);
    expect(text).toMatch(/can't diagnose/i);
  });

  it("contains no doses, numbers or medicine names, and no treatment instructions", () => {
    for (const language of languages) {
      const text = JSON.stringify(medicalReferralReply(language));
      expect(text).not.toMatch(/\d/);
      expect(text).not.toMatch(/paracetamol|acetaminophen|ibuprofen|aspirin|panadol|calpol|tylenol|mg\b|\bml\b|tablet|syrup/i);
      expect(text).not.toMatch(/give (?:him|her|them)|cool (?:bath|compress)|keep (?:him|her) (?:cool|hydrated)/i);
    }
  });
});
