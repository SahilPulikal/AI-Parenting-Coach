import type { CrisisCategory, Language } from "./types";

/**
 * Layer 1 of safety screening: deterministic rules for known high-risk expressions in
 * English, Urdu script and Roman Urdu (Urdu typed in Latin letters).
 *
 * This is NOT complete detection. It only catches wording someone thought of in advance;
 * people describe danger in endless ways. It exists because it is fast, needs no network,
 * and still works when the model-based classifier (layer 2) is down. The rules lean towards
 * over-triggering: a false alarm shows a calm, predefined safety message, while a miss would
 * let ordinary parenting advice answer a crisis.
 */

export interface RuleMatch {
  category: CrisisCategory;
  /** Language to answer in: Urdu for Urdu script and Roman Urdu, English otherwise. */
  language: Language;
}

interface RuleGroup {
  category: CrisisCategory;
  language: Language;
  patterns: RegExp[];
}

/**
 * Makes text comparable: Unicode-normalised and lower-cased, Urdu/Arabic diacritics, tatweel
 * and invisible direction marks removed, common Arabic/Urdu letter variants unified,
 * punctuation turned into spaces, and whitespace collapsed.
 */
export function normalizeText(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[ً-ٰٟـ​-‏‪-‮⁦-⁩﻿]/g, "")
    .replace(/[يىېۍ]/g, "ی") // Arabic yeh / alef maksura / yeh with small v -> Urdu yeh
    .replace(/ك/g, "ک") // Arabic kaf -> Urdu kaf
    .replace(/[هۀةە]/g, "ہ") // heh variants -> Urdu heh
    .replace(/[أإٱ]/g, "ا") // hamza-carrying alef -> alef
    .replace(/[.!?؟۔…\n\r]+/g, " . ") // keep sentence ends: rules do not match across them
    .replace(/[^\p{L}\p{N}\s'.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Shorthand used by the Roman Urdu patterns below.
const NO = "(?:nahi|nahin|nhi|nai|na)"; // "not"
const HURT = "(?:nu[kq]h?sa+n|noqsan)"; // nuksan / nuqsan / nuqsaan / nukhsan
const HIT = "(?:ma+r(?:t[aei]|n[ae]|d[ai]\\w*|dal\\w*|[aeoi])?|peet\\w*|pit\\w*|thapp?ar\\w*)";
const CHILD = "(?:bach\\w*|bete|beta|beti|baby|bachi|bachay|bachey|bachon)";

const RULES: RuleGroup[] = [
  // ---------------------------------------------------------------- self-harm
  {
    category: "self_harm",
    language: "en",
    patterns: [
      /\b(?:kill|killing|hurt|hurting|harm|harming|cut|cutting|injure|injuring|punish|punishing|starve|starving|burn|burning|hang|hanging|drown|drowning) (?:myself|my self)\b/,
      /\bsuicid\w*/,
      /\b(?:end|ending|take|taking) (?:my|my own) (?:own )?life\b/,
      /\b(?:want|wanna|wish|going|plan|planning|thinking|think|feel(?:ing)? like)\b[^.!?]{0,20}\b(?:to )?(?:die|disappear|be dead|not be here|not exist)\b/,
      /\b(?:don'?t|do not|no longer|dont) want to (?:live|be alive|be here|go on|exist)\b/,
      /\bbetter off (?:dead|without me)\b/,
      /\bno (?:reason|point) (?:to|in) (?:live|living|go on|going on|being alive)\b/,
      /\bself[- ]?harm\w*/,
      // Deliberately NOT here: "I can't take this anymore". Exhausted parents say it constantly,
      // so the classifier judges it in context instead of a keyword forcing a crisis reply.
    ],
  },
  {
    category: "self_harm",
    language: "ur",
    patterns: [
      /خود ?کشی/,
      /مر ?جانا چاہ/,
      /مرنا چاہ/,
      /(?:اپنی|اپنے) (?:جان|آپ|زندگی) (?:کو )?(?:لینا|لے|ختم|مار|نقصان|زخمی|کاٹ)/,
      /خود کو (?:نقصان|مار|ختم|زخمی|کاٹ|تکلیف|چوٹ)/,
      /(?:زندہ|جینا) نہیں (?:رہنا|چاہ)/,
      /جینا نہیں چاہ/,
      /زندگی (?:سے تنگ|ختم کر)/,
      /جان دے (?:دوں|دینا|دیں)/,
    ],
  },
  {
    category: "self_harm",
    language: "ur",
    patterns: [
      /\bkhud ?k(?:u|a|h)*s+h+[iey]+\w*/, // khudkushi, khud kushi, khudkashi, khudkhushi, khudkushee
      new RegExp(`\\b(?:khud|apne ?aap|apne ?ap|apni ?jaan|apni ?jan) ?(?:ko|ki|ka)? ?(?:${HURT}|ma+r|khatam|zakhm|hurt|jala|kat|ghayal|chot|takl[ie]f|le (?:lun|loon|lu|lena))\\w*`),
      /\bmar ?ja+(?:na|n|u|un|on|oon) ?chah\w*/,
      /\bmarna chah\w*/,
      /\bmar ?ja(?:un|oon|on|u)\b/,
      new RegExp(`\\b(?:jeena|jena|jina|jeene) ${NO}\\b`),
      /\bzindagi (?:se tang|khatam)\b/,
      /\bjaan de (?:dun|doon|du)\b/,
      /\bsuicid\w*/,
    ],
  },

  // ------------------------------------------------------- medical emergency
  {
    category: "medical_emergency",
    language: "en",
    patterns: [
      /\b(?:unconscious|unresponsive|not responsive|passed out|fainted|blacked out)\b/,
      /\b(?:not|isn'?t|won'?t|stopped) (?:breathing|breathe)\b/,
      /\b(?:can'?t|cannot|struggling to|trouble|difficulty) breath\w*/,
      /\b(?:not|isn'?t|won'?t) respond\w* (?:at all|to (?:touch|his name|her name|their name|my voice|being shaken|pain))\b/,
      /\b(?:not|isn'?t|won'?t|can'?t|cannot) (?:wake|waking|waking up)(?: up)?\b/,
      /\b(?:went|goes|is|gone|became|becoming) limp\b/,
      /\b(?:turning|turned|going|gone|is) blue\b|\bblue lips\b|\blips (?:are |turned |turning )?blue\b/,
      /\b(?:having a |had a |is having a )?(?:seizure|seizing|convuls\w*)\b/,
      /\b(?:choking|choked|gasping)\b/,
      /\b(?:drown\w*|anaphyla\w*|overdos\w*|poison\w*)\b/,
      /\bswallowed (?:a |an |some |the |my |his |her )?(?:battery|batteries|magnet|magnets|bleach|poison|pills?|medicine|medication|detergent|cleaning)\b/,
      /\b(?:bleeding (?:heavily|badly|a lot|profusely|won'?t stop)|won'?t stop bleeding|severe(?:ly)? bleeding|bleeding (?:from|out))\b/,
      /\b(?:throat|tongue|face|lips) (?:is |are )?(?:swelling|swollen|closing)\b/,
    ],
  },
  {
    category: "medical_emergency",
    language: "ur",
    patterns: [
      /بے ?ہوش/,
      /سانس (?:نہیں|رک|بند|لینے میں)/,
      /دم گھٹ/,
      /نیلا (?:پڑ|ہو)|نیلے (?:پڑ|ہو)/,
      /دورہ پڑ|تشنج|جھٹکے لگ/,
      /خون (?:بند )?نہیں (?:رک|ہو)|بہت خون بہ/,
      /زہر/,
      /ڈوب/,
      /(?:جاگ|اٹھ|ہل) نہیں (?:رہا|رہی)/,
      /ہوش (?:میں )?نہیں/,
      /نگل (?:لی|لیا|گیا|گئی)/,
    ],
  },
  {
    category: "medical_emergency",
    language: "ur",
    patterns: [
      /\b(?:be|bey) ?hosh\w*/,
      /\bhosh (?:mein|me|main)? ?(?:nahi|nahin|nhi)\w*/,
      /\bsaans? (?:nahi|nahin|nhi|ruk|band|lene mein)\w*/,
      /\bdam ghut\w*/,
      /\bneel[ae] (?:par|pad|ho)\w*/,
      /\b(?:daura|dora) (?:par|pad)\w*|\bjhatk[ae]\b|\bmirgi\b/,
      /\bkhoon (?:band )?(?:nahi|nahin|nhi) (?:ruk|ho)\w*|\bbahut khoon beh\w*|\bkhoon beh raha\b/,
      /\bz[ae]h?[ae]r\b/, // zeher, zehar, zahar, zaher
      /\bdoob\w*/,
      /\b(?:jaag|uth|hil)\w* (?:nahi|nahin|nhi) (?:raha|rahi|rha)\b/,
      /\bnigal (?:li|liya|gaya|gayi)\b/,
    ],
  },

  // -------------------------------------------------------------- child abuse
  {
    category: "child_abuse",
    language: "en",
    patterns: [
      // Someone else harming the parent's child ("someone at home may hurt my child").
      /\b(?:someone|somebody|anyone|husband|wife|partner|father|mother|dad|mom|mum|stepfather|stepmother|step-?dad|uncle|aunt|grandfather|grandmother|teacher|relative|neighbou?r|boyfriend|girlfriend|babysitter|nanny|caretaker|driver|tutor)\b[^.!?]{0,40}\b(?:hurt|hurts|hit|hits|beat|beats|beating|harm|harms|abuse|abuses|abused|abusing|molest\w*|assault\w*|touch\w*|kill|kills|threat\w*|burn\w*|choke\w*|shak\w*|slap\w*|punch\w*|kick\w*)\b[^.!?]{0,20}\b(?:my|our|the)\s+(?:child|kid|son|daughter|baby|toddler|children|boy|girl|kids)\b/,
      // The parent is afraid of harm to the child, including from themselves.
      /\b(?:afraid|scared|fear|worried|terrified|frightened)\b[^.!?]{0,30}\b(?:hurt|harm|hit|beat|kill|shake|abuse|molest|touch)\w*\b[^.!?]{0,20}\b(?:my|our|the)\s+(?:child|kid|son|daughter|baby|toddler|children|kids)\b/,
      /\b(?:might|may|could|going to|want to|wanna) (?:hurt|harm|hit|beat|shake|kill) (?:my|our|the) (?:child|kid|son|daughter|baby|toddler)\b/,
      /\b(?:child|kid|son|daughter|baby|toddler|children) (?:is|was|has been|got|are|were) (?:being )?(?:abused|molested|assaulted|raped|beaten up|touched inappropriately)\b/,
      /\bchild abuse\b|\b(?:sexual(?:ly)?) (?:abus\w*|assault\w*|touch\w*)\b|\bmolest\w*|\brape[sd]?\b|\bpedophil\w*|\bpaedophil\w*/,
    ],
  },
  {
    category: "child_abuse",
    language: "ur",
    patterns: [
      /جنسی (?:زیادتی|ہراسانی|تشدد|استحصال|طور پر)/,
      /بچ(?:ے|ی|وں) (?:کے ساتھ|پر) (?:جنسی|تشدد)/,
      /(?:گھر میں کوئی|گھر کا کوئی|کوئی بڑا|کوئی بالغ|کوئی آدمی|کوئی شخص|کوئی مرد|شوہر|خاوند|میاں|بیوی|ساس|سسر|چچا|ماموں|پھوپھا|خالو|باپ|والد|ماں|والدہ|استاد|ٹیچر|ملازم|نوکر|ڈرائیور|رشتہ دار|پڑوسی|سوتیلا|سوتیلی|بہنوئی|ٹیوٹر)[^.!?۔؟]{0,40}(?:بچے|بچی|بچوں|بیٹے|بیٹی)[^.!?۔؟]{0,25}(?:نقصان|مار|تکلیف|تشدد|ہاتھ لگا|چھو|جنسی|قتل|جلا)/,
      /(?:ڈر|خوف|خدشہ)[^.!?۔؟]{0,40}(?:بچے|بچی|بچوں|بیٹے|بیٹی)[^.!?۔؟]{0,25}(?:نقصان|مار|تکلیف|تشدد|ہاتھ لگا|چھو|جنسی)/,
      /(?:بچے|بچی|بچوں|بیٹے|بیٹی)[^.!?۔؟]{0,40}(?:نقصان|مار|تکلیف|تشدد)[^.!?۔؟]{0,30}(?:ڈر|خوف|خدشہ)/,
    ],
  },
  {
    category: "child_abuse",
    language: "ur",
    patterns: [
      new RegExp(`\\b(?:ghar (?:mein|me|main) koi|ghar ka koi|koi bara|koi baalig|koi aadmi|koi shakhs|koi mard|shohar|shauhar|shoher|husband|khawand|miyan|biwi|saas|sasur|susar|chacha|mamu|mama|phupha|khalu|baap|walid|maa|walida|ustad|teacher|naukar|driver|rishtedar|parosi|sautela|sauteli|tutor)\\b[^.!?]{0,40}\\b(?:mere |hamare |meray )?${CHILD}\\b[^.!?]{0,25}\\b(?:${HURT}|${HIT}|takl[ie]f|tash+ad+ud|haath laga\\w*|chhu\\w*|chu\\w*|jinsi|qatal|jala\\w*)`),
      new RegExp(`\\b(?:dar|khauf|khadsha|darta|darti)\\b[^.!?]{0,40}\\b${CHILD}\\b[^.!?]{0,25}\\b(?:${HURT}|${HIT}|takl[ie]f|tash+ad+ud|haath laga\\w*|chhu\\w*|jinsi)`),
      new RegExp(`\\b${CHILD}\\b[^.!?]{0,40}\\b(?:${HURT}|${HIT}|takl[ie]f|tash+ad+ud)\\w*[^.!?]{0,30}\\b(?:dar|khauf|khadsha)\\b`),
      /\bbach\w* (?:par|per|pe) tash+ad+u?d\b/,
      /\bjinsi (?:zyad\w+|ziyad\w+|zayad\w+|hawas|tash+ad+ud|hara\w+|istehsal)\b/,
    ],
  },

  // ------------------------------------------------------- domestic violence
  {
    category: "domestic_violence",
    language: "en",
    patterns: [
      /\bdomestic (?:violence|abuse)\b/,
      /\b(?:husband|wife|partner|boyfriend|girlfriend|spouse|ex|father|mother|dad|mom|mum|in-?laws?|mother-in-law|father-in-law|brother|stepfather)\b[^.!?]{0,25}\b(?:hit|hits|beat|beats|beating|slap\w*|punch\w*|kick\w*|choke\w*|strangl\w*|hurt\w*|abus\w*|threat\w*|attack\w*|assault\w*|burn\w*)\b[^.!?]{0,10}\b(?:me|us)\b/,
      /\b(?:he|she|they|someone)\b[^.!?]{0,15}\b(?:will|is going to|is gonna|threatened to|threatens to|wants to|said (?:he|she|they)(?:'ll| will)) (?:kill|murder|hurt) (?:me|us)\b/,
      /\b(?:going to|gonna|threaten\w* to|want(?:s)? to) (?:kill|murder) (?:me|us)\b/,
      /\b(?:afraid|scared|terrified|fear|frightened) (?:of|for) (?:my )?(?:husband|wife|partner|boyfriend|girlfriend|spouse|ex|father|mother|in-?laws?|life|safety)\b/,
      /\b(?:not|never|isn'?t|am not|i'?m not) safe (?:at|in) (?:home|my home|the house|my house)\b|\bi'?m not safe\b/,
      /\b(?:i am|i'?m|i was|i get|i got) (?:being )?(?:beaten|abused|hit|slapped|choked|strangled|threatened)\b/,
    ],
  },
  {
    category: "domestic_violence",
    language: "ur",
    patterns: [
      /گھریلو (?:تشدد|زیادتی)/,
      /(?:شوہر|خاوند|میاں|بیوی|منگیتر|ساس|سسر|سسرال|نند|دیور|جیٹھ|گھر والے|گھر والوں|باپ|بھائی|سابق)[^.!?۔؟]{0,30}(?:مجھے|ہمیں|مجھ پر)[^.!?۔؟]{0,25}(?:مار|پیٹ|تشدد|دھمکی|تھپڑ|جان سے|گلا|جلا|ٹھوکر|لات)/,
      /(?:مجھے|ہمیں)[^.!?۔؟]{0,15}(?:جان سے مار|قتل کر)/,
      /(?:شوہر|خاوند|میاں|سسرال|ساس|سسر|گھر والوں?) سے (?:ڈر|خوف)/,
      /میں (?:گھر میں )?محفوظ نہیں/,
    ],
  },
  {
    category: "domestic_violence",
    language: "ur",
    patterns: [
      new RegExp(`\\b(?:shohar|shauhar|shoher|khawand|khaond|miyan|husband|biwi|saas|sasur|susar|sasural|nand|devar|jeth|ghar wale|ghar walay|baap|bhai|ex)\\b[^.!?]{0,30}\\b(?:mujh(?:e|ay|ey|ko)?|hamein|humein|mujh par|mujhpar)\\b[^.!?]{0,25}\\b(?:${HIT}|tash+ad+ud|dhamk[ie]\\w*|jaan se|gala|jala\\w*|laat)`),
      /\bghar[ei]?lu (?:tash+ad+ud|zulm|zyadti|violence)\b|\bghareloo\b/,
      /\bmujh(?:e|ay|ey|ko)? ?jaan se (?:maar|mar)\w*/,
      /\b(?:shohar|shauhar|khawand|miyan|saas|sasural|ghar walon?) se (?:dar|khauf)\b/,
      /\bmain (?:ghar mein |ghar me )?(?:mehfooz|mehfuz|mahfooz) (?:nahi|nahin|nhi)\b/,
    ],
  },

  // --------------------------------------------------------- immediate danger
  {
    category: "immediate_danger",
    language: "en",
    patterns: [
      /\b(?:in|are in|is in) (?:immediate |serious |real |grave )?danger\b/,
      /\b(?:fear|afraid|scared) for (?:my|our|his|her) (?:life|lives|safety)\b|\blife is in danger\b/,
      /\b(?:has|have|with|pulled|holding) (?:a |an )?(?:gun|knife|weapon)\b/,
      /\b(?:kidnap\w*|abduct\w*|abducted)\b/,
      /\b(?:child|kid|son|daughter|baby|toddler) (?:is |has gone |went )?missing\b|\bcan'?t find my (?:child|kid|son|daughter|baby|toddler)\b/,
      /\b(?:house|home|building|flat|apartment) (?:is )?on fire\b|\bfire (?:in|at) (?:the|our|my) (?:house|home|flat|building)\b/,
      /\b(?:trying|going|threatening) to kill\b/,
    ],
  },
  {
    category: "immediate_danger",
    language: "ur",
    patterns: [
      /جان (?:کو|کا) خطرہ/,
      /خطرے میں/,
      /اغوا/,
      /(?:بچہ|بچی|بیٹا|بیٹی) (?:گم|لاپتہ|نہیں مل)/,
      /آگ لگ/,
      /بندوق|پستول/,
    ],
  },
  {
    category: "immediate_danger",
    language: "ur",
    patterns: [
      /\bjaan (?:ko|ka) khatr[ae]\b/,
      /\bkhatre (?:mein|me|main)\b/,
      /\b(?:agh?wa|ighwa|aghwah)\b/,
      /\bbach\w* (?:gum|gm|lapata)\b|\bbach\w* (?:nahi|nahin|nhi) mil (?:raha|rahi|rha)\b/,
      /\baag lag\w*/,
      /\bbandoo?[kq]\b|\bpistol\b/,
    ],
  },
];

/**
 * Returns the first rule that fires on the text, or null. Order within RULES sets priority:
 * self-harm and medical emergencies first.
 */
export function matchRules(text: string): RuleMatch | null {
  const normalized = normalizeText(text);
  for (const group of RULES) {
    if (group.patterns.some((pattern) => pattern.test(normalized))) {
      return { category: group.category, language: group.language };
    }
  }
  return null;
}
