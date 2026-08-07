/**
 * Deterministic red-flag rules, drawn straight from the OT documents' red-flag
 * lists (§9 of the content pack; Ch.1.8 / 3.9 of the knowledge base). If any
 * rule fires, the message must be escalated to a human and NO advice given.
 *
 * These are intentionally high-recall (better a false escalation than a missed
 * one). The LLM backstop catches phrasings — Twi, Pidgin, mixed — that the
 * keyword rules miss.
 *
 * Every message is folded to plain ASCII before matching (see text/fold), so
 * Twi patterns are written without ɛ/ɔ and cover "ɛyɛ", "eye" and "3y3" alike.
 *
 * ⚠️ TWI REVIEW PENDING — the Twi patterns below are drafts and must be checked
 * by a native speaker alongside `tips.data.ts` before the pilot. The English
 * and Pidgin patterns are not affected by that review.
 */
import { foldGhanaianLoose } from '../text/fold';

export interface RedFlagRule {
  id: string;
  /** Human-readable reason logged on the referral. */
  reason: string;
  patterns: RegExp[];
}

export const RED_FLAG_RULES: RedFlagRule[] = [
  {
    id: 'numbness-weakness',
    reason: 'Numbness, tingling or weakness',
    patterns: [
      /\bnumb/i,
      /tingl/i,
      /\bweak(ness)?\b/i,
      /can'?t feel/i,
      /no feeling/i,
      /pins and needles/i,
      // Twi: "me nsa awu" (my hand is dead), "mente nka" (I feel nothing),
      // "me ho ye mmerew" (my body is weak).
      /\b(?:me\s+)?(?:nsa|nan|nsateaa)\s+awu\b/i,
      /\bmente\s+nka\b/i,
      /\bmmerew\b/i,
      /\bahooden\s+nni\b/i,
      // Pidgin
      /\bi\s+no\s+(?:dey\s+)?feel\b/i,
      /\bmy\s+body\s+(?:dey\s+)?weak\b/i,
    ],
  },
  {
    id: 'cannot-move',
    reason: "Can't move a limb / can't bear weight",
    patterns: [
      /can'?t move/i,
      /cannot move/i,
      /can'?t (stand|walk|work)/i,
      /can'?t bear weight/i,
      /paralys/i,
      /leg gave way/i,
      // Twi: "mentumi nnantew" (I can't walk), "mentumi nsore" (I can't get
      // up), "mentumi nye adwuma" (I can't work).
      /\bmentumi\s+n(?:nantew|sore|gyina|ye\s+adwuma|nyan)\b/i,
      // Pidgin
      /\bi\s+no\s+fit\s+(?:waka|stand|move|work|comot)\b/i,
    ],
  },
  {
    id: 'trauma',
    reason: 'Pain after a fall, accident or injury',
    patterns: [
      /\bfell\b/i,
      /\bfall\b/i,
      /after (a|an) (fall|accident|injury)/i,
      /accident/i,
      /\binjur/i,
      /broke my/i,
      /fracture/i,
      /deform/i,
      // Twi: "mehwe ase" (I fell down), "apirakua" (wound), "kaa boo me"
      // (a car hit me).
      /\b(?:me|ma|o)hwe\s+ase\b/i,
      /\bapira(?:kua)?\b/i,
      /\bkaa\s+bo+\s+me\b/i,
      // Pidgin
      /\bi\s+fall\s+(?:down|for\s+ground)\b/i,
      /\b(?:car|moto)\s+(?:hit|knock)\s+me\b/i,
    ],
  },
  {
    id: 'chest-breathing',
    reason: 'Chest pain or difficulty breathing',
    patterns: [
      /chest pain/i,
      /chest (is )?tight/i,
      /can'?t breathe/i,
      /difficulty breathing/i,
      /short of breath/i,
      /breathless/i,
      // Twi: "me koko mu ye me ya" (my chest hurts), "mentumi nhome"
      // (I can't breathe).
      /\bkoko\s+mu\b/i,
      /\bmentumi\s+nhome\b/i,
      /\bahome\s+(?:nni|ye\s+den)\b/i,
      // Pidgin
      /\bi\s+no\s+fit\s+breathe?\b/i,
      /\bmy\s+chest\s+dey\s+pain\b/i,
    ],
  },
  {
    id: 'swelling-fever',
    reason: 'Swelling, redness or fever with pain',
    patterns: [
      /\bfever\b/i,
      /hot and (red|swollen)/i,
      /red and warm/i,
      /swollen and red/i,
      /one leg.*swell/i,
      /calf.*(swell|red)/i,
      // Twi: "atiridii" (fever), "ahonhon"/"ahuru" (swelling).
      /\batiridi+\b/i,
      /\bahon(?:hon)?\b/i,
      /\bahuru\b/i,
      // Pidgin
      /\b(?:e|am|body)\s+dey\s+hot\b/i,
      /\be\s+swell\b/i,
    ],
  },
  {
    id: 'bladder-bowel',
    reason: 'Loss of bladder or bowel control',
    patterns: [
      /bladder/i,
      /bowel/i,
      /can'?t control (my )?(pee|urine|toilet|stool)/i,
      /wetting myself/i,
      // Twi: "dwonso" (urine), "ebin" (stool) — flagged when paired with an
      // inability, which is what makes it a red flag rather than a symptom.
      /\bmentumi\s+n\w*\s*(?:me\s+)?(?:dwonso|ebin|tiafi)\b/i,
      /\bdwonso\s+(?:gu|to)\b/i,
      // Pidgin
      /\bi\s+no\s+fit\s+hold\s+(?:my\s+)?(?:pee|urine|toilet|shit)\b/i,
      /\btoilet\s+dey\s+comot\b/i,
    ],
  },
  {
    id: 'persistent-worsening',
    reason: 'Pain lasting weeks and worsening / night pain / weight loss',
    patterns: [
      /getting worse/i,
      /worse every (day|week)/i,
      /for (weeks|months)/i,
      /night pain/i,
      /wakes me at night/i,
      /losing weight/i,
      /weight loss/i,
      // Twi: "eko so den" (it keeps getting worse), "nnawotwe pii" (many
      // weeks), "anadwo" + pain (night pain), "meretew" (I'm losing weight).
      /\beko\s+so\s+den\b/i,
      /\bnnawotwe\s+(?:pii|dodow)\b/i,
      /\babosome\s+(?:pii|dodow)\b/i,
      /\banadwo\b[^.\n]{0,20}\bya\b/i,
      // Pidgin
      /\be\s+dey\s+worse\b/i,
      /\be\s+no\s+dey\s+better\b/i,
      /\bfor\s+weeks\s+now\b/i,
    ],
  },
  {
    id: 'severe',
    reason: 'Severe or sudden pain',
    patterns: [
      /severe/i,
      /unbearable/i,
      /worst pain/i,
      /sudden(ly)? (severe|sharp) pain/i,
      /\b(9|10)\s*\/\s*10\b/i,
      /\bpain.*\b(9|10)\b/i,
      // Twi: "eye me ya paa" / "ya kese" (it hurts me a lot / big pain),
      // "boro so" (too much).
      /\bya\s+(?:paa|kese|dodo)\b/i,
      /\byaw\s+(?:paa|kese)\b/i,
      /\bboro\s+so\b/i,
      // Pidgin
      /\b(?:e|am)\s+(?:dey\s+)?pain\s+me\s+(?:well\s+well|too\s+much|bad)\b/i,
      /\bserious\s+pain\b/i,
    ],
  },
];

export interface RuleMatch {
  matched: boolean;
  ruleIds: string[];
  reason: string;
}

/**
 * Run all deterministic rules over a message. The message is folded first so
 * one pattern covers every way a worker might spell a Twi word.
 */
export function runRedFlagRules(message: string): RuleMatch {
  const folded = foldGhanaianLoose(message);
  const hits = RED_FLAG_RULES.filter((rule) => rule.patterns.some((p) => p.test(folded)));
  return {
    matched: hits.length > 0,
    ruleIds: hits.map((h) => h.id),
    reason: hits.map((h) => h.reason).join('; '),
  };
}
