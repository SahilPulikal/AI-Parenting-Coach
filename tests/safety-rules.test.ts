import { describe, expect, it } from "vitest";
import { matchRules, normalizeText } from "@/lib/safety-rules";
import { english, romanUrdu, urdu } from "./fixtures/crisis-cases";

describe("deterministic safety rules: crisis wording is caught", () => {
  it.each(english)("English: %s", (text, category) => {
    expect(matchRules(text)?.category).toBe(category);
  });
  it.each(urdu)("Urdu: %s", (text, category) => {
    expect(matchRules(text)?.category).toBe(category);
  });
  it.each(romanUrdu)("Roman Urdu: %s", (text, category) => {
    expect(matchRules(text)?.category).toBe(category);
  });

  it("answers in Urdu for Urdu script and Roman Urdu, English for English", () => {
    expect(matchRules("My husband beats me")?.language).toBe("en");
    expect(matchRules("میرا شوہر مجھے مارتا ہے")?.language).toBe("ur");
    expect(matchRules("mera shohar mujhe maarta hai")?.language).toBe("ur");
  });

  it("ignores letter case, extra spacing and surrounding punctuation", () => {
    expect(matchRules("  MY   HUSBAND   BEATS   ME!!! ")?.category).toBe("domestic_violence");
    expect(matchRules("MERA SHOHAR  mujhe   MAARTA hai...")?.category).toBe("domestic_violence");
  });
});

describe("deterministic safety rules: everyday concerns are not flagged", () => {
  it.each([
    "My 5-year-old refuses to sleep and keeps asking for screen time.",
    "My toddler hits me when she is angry",
    "My child is not responding to my instructions at bedtime",
    "My son hit a kid at school and I don't know what to do",
    "How do I stop my toddler from hitting his sister?",
    "I feel exhausted and overwhelmed by bedtime",
    "I can't take this anymore, the tantrums are exhausting me",
    "My husband and I disagree about screen time",
    "My daughter has a cold and a cough",
    "My son has a fever and a rash. Which medicine and what dose should I give him?",
    "میرا بچہ رات کو سونے سے انکار کرتا ہے، میں کیا کروں؟",
    "بچہ موبائل بہت استعمال کرتا ہے",
    "بچہ اسکول جانے سے ڈرتا ہے",
    "بچے کو ہلکا بخار ہے",
    "میرا بیٹا اپنی بہن کو مارتا ہے",
    "mera bacha raat ko sone se inkar karta hai",
    "mera beta phone bohat istemal karta hai aur main kya karun",
    "bacha school jane se darta hai",
    "mera beta apni behan ko marta hai",
    "bachay ko bukhar hai aur dawai ka dose kya hona chahiye",
  ])("%s", (text) => {
    expect(matchRules(text)).toBeNull();
  });
});

describe("normalizeText", () => {
  it("unifies Arabic letter variants and strips diacritics and invisible marks", () => {
    expect(normalizeText("ميرا خُودكشي")).toBe(normalizeText("میرا خودکشی"));
    expect(normalizeText("خود‌کشی")).toBe("خودکشی");
  });
  it("keeps sentence ends so rules cannot match across sentences", () => {
    expect(matchRules("My husband is kind. He gave my son a toy.")).toBeNull();
  });
});
