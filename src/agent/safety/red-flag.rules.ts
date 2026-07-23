/**
 * Deterministic red-flag rules, drawn straight from the OT documents' red-flag
 * lists (§9 of the content pack; Ch.1.8 / 3.9 of the knowledge base). If any
 * rule fires, the message must be escalated to a human and NO advice given.
 *
 * These are intentionally high-recall (better a false escalation than a missed
 * one). The LLM backstop catches phrasings — Twi, Pidgin, mixed — that the
 * keyword rules miss.
 */
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
    patterns: [/\bnumb/i, /tingl/i, /\bweak(ness)?\b/i, /can'?t feel/i, /no feeling/i, /pins and needles/i],
  },
  {
    id: 'cannot-move',
    reason: "Can't move a limb / can't bear weight",
    patterns: [/can'?t move/i, /cannot move/i, /can'?t (stand|walk|work)/i, /can'?t bear weight/i, /paralys/i, /leg gave way/i],
  },
  {
    id: 'trauma',
    reason: 'Pain after a fall, accident or injury',
    patterns: [/\bfell\b/i, /\bfall\b/i, /after (a|an) (fall|accident|injury)/i, /accident/i, /\binjur/i, /broke my/i, /fracture/i, /deform/i],
  },
  {
    id: 'chest-breathing',
    reason: 'Chest pain or difficulty breathing',
    patterns: [/chest pain/i, /chest (is )?tight/i, /can'?t breathe/i, /difficulty breathing/i, /short of breath/i, /breathless/i],
  },
  {
    id: 'swelling-fever',
    reason: 'Swelling, redness or fever with pain',
    patterns: [/\bfever\b/i, /hot and (red|swollen)/i, /red and warm/i, /swollen and red/i, /one leg.*swell/i, /calf.*(swell|red)/i],
  },
  {
    id: 'bladder-bowel',
    reason: 'Loss of bladder or bowel control',
    patterns: [/bladder/i, /bowel/i, /can'?t control (my )?(pee|urine|toilet|stool)/i, /wetting myself/i],
  },
  {
    id: 'persistent-worsening',
    reason: 'Pain lasting weeks and worsening / night pain / weight loss',
    patterns: [/getting worse/i, /worse every (day|week)/i, /for (weeks|months)/i, /night pain/i, /wakes me at night/i, /losing weight/i, /weight loss/i],
  },
  {
    id: 'severe',
    reason: 'Severe or sudden pain',
    patterns: [/severe/i, /unbearable/i, /worst pain/i, /sudden(ly)? (severe|sharp) pain/i, /\b(9|10)\s*\/\s*10\b/i, /\bpain.*\b(9|10)\b/i],
  },
];

export interface RuleMatch {
  matched: boolean;
  ruleIds: string[];
  reason: string;
}

/** Run all deterministic rules over a message. */
export function runRedFlagRules(message: string): RuleMatch {
  const hits = RED_FLAG_RULES.filter((rule) => rule.patterns.some((p) => p.test(message)));
  return {
    matched: hits.length > 0,
    ruleIds: hits.map((h) => h.id),
    reason: hits.map((h) => h.reason).join('; '),
  };
}
