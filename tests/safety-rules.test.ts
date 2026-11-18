import { describe, expect, it } from "vitest";
import { matchRules, normalizeText } from "@/lib/safety-rules";
import type { CrisisCategory } from "@/lib/types";

type Case = [text: string, category: CrisisCategory];

const english: Case[] = [
  ["My child is unconscious and not responding.", "medical_emergency"],
  ["He stopped breathing a minute ago", "medical_emergency"],
  ["She is having a seizure right now", "medical_emergency"],
  ["My baby is choking on a grape", "medical_emergency"],
  ["He swallowed a battery", "medical_emergency"],
  ["Her lips are turning blue", "medical_emergency"],
  ["He won't wake up", "medical_emergency"],
  ["I feel like hurting myself and I don't know what to do.", "self_harm"],
  ["I want to kill myself", "self_harm"],
  ["I've been having suicidal thoughts", "self_harm"],
  ["I don't want to live anymore", "self_harm"],
  ["Everyone would be better off without me", "self_harm"],
  ["I want to die", "self_harm"],
  ["I'm afraid someone at home may hurt my child.", "child_abuse"],
  ["My husband hits my son when he is angry", "child_abuse"],
  ["His uncle touched my daughter inappropriately", "child_abuse"],
  ["I'm scared I might hurt my baby", "child_abuse"],
  ["I think my child is being abused", "child_abuse"],
  ["My husband beats me", "domestic_violence"],
  ["My partner hit me and threatened to kill me", "domestic_violence"],
  ["I'm afraid of my husband", "domestic_violence"],
  ["We are victims of domestic violence", "domestic_violence"],
  ["He said he will kill me", "domestic_violence"],
  ["I'm not safe at home", "domestic_violence"],
  ["Someone is trying to kill us", "immediate_danger"],
  ["He has a gun", "immediate_danger"],
  ["I can't find my toddler anywhere", "immediate_danger"],
  ["Our house is on fire", "immediate_danger"],
];

const urdu: Case[] = [
  ["میرا بچہ بے ہوش ہے اور حرکت نہیں کر رہا", "medical_emergency"],
  ["بچے کو سانس نہیں آ رہی", "medical_emergency"],
  ["بچے کو دورہ پڑ رہا ہے", "medical_emergency"],
  ["بچے نے زہر پی لیا ہے", "medical_emergency"],
  ["میں خود کو نقصان پہنچانا چاہتا ہوں", "self_harm"],
  ["میں خودکشی کرنا چاہتی ہوں", "self_harm"],
  ["میں خود کشی کے بارے میں سوچ رہا ہوں", "self_harm"],
  ["میں مرنا چاہتا ہوں", "self_harm"],
  ["میں اب جینا نہیں چاہتی", "self_harm"],
  ["مجھے ڈر ہے کہ گھر میں کوئی میرے بچے کو نقصان پہنچائے گا", "child_abuse"],
  ["میرے بچے کے ساتھ جنسی زیادتی ہوئی ہے", "child_abuse"],
  ["بچے پر تشدد ہو رہا ہے", "child_abuse"],
  ["میرا شوہر مجھے مارتا ہے", "domestic_violence"],
  ["سسرال والے مجھے جان سے مارنے کی دھمکی دیتے ہیں", "domestic_violence"],
  ["ہم گھریلو تشدد کا شکار ہیں", "domestic_violence"],
  ["میں گھر میں محفوظ نہیں ہوں", "domestic_violence"],
  ["بچہ گم ہو گیا ہے", "immediate_danger"],
  ["ہماری جان کو خطرہ ہے", "immediate_danger"],
  // Arabic letter variants and diacritics must not defeat matching.
  ["میں خُودکُشی کرنا چاہتی ہوں", "self_harm"], // with diacritics
  ["ميرا بچہ بے هوش ہے", "medical_emergency"], // Arabic yeh and heh
];

const romanUrdu: Case[] = [
  ["main khudkushi karna chahti hoon", "self_harm"],
  ["khud kushi ka khayal aa raha hai", "self_harm"],
  ["khudkashi", "self_harm"],
  ["khudkushee kar loon", "self_harm"],
  ["khudkhushi karna chahta hun", "self_harm"],
  ["mujhe khud ko nuqsan pohanchane ka dil kar raha hai", "self_harm"],
  ["main apne aap ko nuksan pohnchana chahta hoon", "self_harm"],
  ["mar jana chahta hoon", "self_harm"],
  ["main ab jeena nahi chahti", "self_harm"],
  ["mera bacha behosh hai aur saans nahi le raha", "medical_emergency"],
  ["baccha bey hosh ho gaya hai", "medical_emergency"],
  ["bache ko daura par raha hai", "medical_emergency"],
  ["usne zeher pi liya", "medical_emergency"],
  ["bachay ka khoon nahi ruk raha", "medical_emergency"],
  ["ghar mein koi mere bachay ko nuqsan pohanchaye ga mujhe dar hai", "child_abuse"],
  ["mujhe dar hai ke koi mere bache ko nuksan pohanchaye", "child_abuse"],
  ["mere bachay par tashadud hota hai", "child_abuse"],
  ["bachi ke saath jinsi zyadti hui", "child_abuse"],
  ["shohar mere bete ko maarta hai", "child_abuse"],
  ["mera shohar mujhe maarta hai", "domestic_violence"],
  ["shauhar mujhay marta hai", "domestic_violence"],
  ["mera khawand mujhe peet-ta hai", "domestic_violence"],
  ["ghareloo tashadud ka shikar hoon", "domestic_violence"],
  ["mujhe jaan se marne ki dhamki di hai", "domestic_violence"],
  ["main ghar mein mehfooz nahi hoon", "domestic_violence"],
  ["khawand se dar lagta hai", "domestic_violence"],
  ["bacha gum ho gaya hai", "immediate_danger"],
  ["ghar mein aag lag gayi", "immediate_danger"],
  ["unke paas bandook hai", "immediate_danger"],
];

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
