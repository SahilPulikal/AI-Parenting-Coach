import type { Language } from "./types";

// Arabic-script blocks used by Urdu (Arabic, Supplement, Presentation Forms A/B).
const ARABIC_SCRIPT = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g;
const LATIN = /[A-Za-z]/g;

/**
 * Distinctive Roman Urdu words. Deliberately excludes words that are also common
 * English words (main, to, so, me, us, ...), because a false "Urdu" verdict is worse
 * than falling back to English.
 */
const ROMAN_URDU_WORDS = new Set([
  "mera", "meri", "mere", "humara", "hamara", "hamari", "tumhara",
  "bacha", "bachay", "bachey", "bachon", "bachi", "bacho", "beta", "beti",
  "hai", "hain", "hota", "hoti", "hote", "tha", "thi", "raha", "rahi", "rahe",
  "nahi", "nahin", "nai", "kya", "kyun", "kyon", "kaise", "kese", "kiya", "kia",
  "karta", "karti", "karte", "karun", "karen", "kare", "karna", "karo",
  "aap", "aapko", "mujhe", "mujhay", "usay", "usko", "unko", "humein",
  "ko", "ka", "ki", "ke", "mein", "mei", "ghar", "raat", "sona", "sonay", "sota", "soti",
  "bohat", "bahut", "lekin", "magar", "abhi", "bhi", "aur", "kuch", "bohot",
  "maar", "marta", "marti", "darta", "darti", "ro", "rota", "roti", "gussa",
]);

export function hasUrduScript(text: string): boolean {
  return (text.match(ARABIC_SCRIPT)?.length ?? 0) > 0;
}

/** True when the Latin-letter text looks like Roman Urdu (Urdu typed in English letters). */
export function isRomanUrdu(text: string): boolean {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  if (words.length === 0) return false;
  const hits = words.filter((w) => ROMAN_URDU_WORDS.has(w)).length;
  // Need at least two markers and a meaningful share of the words. Anything less is
  // ambiguous and falls back to English.
  return hits >= 2 && hits / words.length >= 0.3;
}

/**
 * Language the coach should reply in.
 * - Arabic-script letters outnumber Latin letters: Urdu.
 * - Latin text that reads as Roman Urdu: Urdu (the reply is written in Urdu script).
 * - Everything else, including ambiguous text: English.
 */
export function detectLanguage(text: string): Language {
  const arabic = text.match(ARABIC_SCRIPT)?.length ?? 0;
  const latin = text.match(LATIN)?.length ?? 0;
  if (arabic > latin) return "ur";
  if (arabic === 0 && isRomanUrdu(text)) return "ur";
  return "en";
}
