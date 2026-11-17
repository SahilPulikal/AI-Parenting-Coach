import { describe, expect, it } from "vitest";
import { detectLanguage, isRomanUrdu } from "@/lib/language";

describe("detectLanguage", () => {
  it("detects English", () => {
    expect(detectLanguage("My 5-year-old refuses to sleep and keeps asking for screen time.")).toBe("en");
  });

  it("detects Urdu script", () => {
    expect(detectLanguage("میرا بچہ رات کو سونے سے انکار کرتا ہے، میں کیا کروں؟")).toBe("ur");
  });

  it("treats mostly-Urdu text with a few English words as Urdu", () => {
    expect(detectLanguage("میرا بچہ school جانے سے انکار کرتا ہے")).toBe("ur");
  });

  it("treats mostly-English text with one Urdu word as English", () => {
    expect(detectLanguage("My son keeps saying بچہ when he is upset about school")).toBe("en");
  });

  it("detects Roman Urdu", () => {
    expect(detectLanguage("mera bacha raat ko sone se inkar karta hai")).toBe("ur");
    expect(detectLanguage("Mera beta bohat gussa karta hai aur main kya karun")).toBe("ur");
  });

  it("falls back to English when Roman Urdu evidence is ambiguous", () => {
    expect(isRomanUrdu("kya")).toBe(false);
    expect(detectLanguage("kya")).toBe("en");
    expect(detectLanguage("My toddler loves the song Baby Shark and bhi")).toBe("en");
  });

  it("does not misclassify ordinary English as Roman Urdu", () => {
    expect(detectLanguage("I do not know what to do when my child is angry at home")).toBe("en");
  });

  it("handles empty-ish text", () => {
    expect(detectLanguage("")).toBe("en");
    expect(detectLanguage("12345 ???")).toBe("en");
  });
});
