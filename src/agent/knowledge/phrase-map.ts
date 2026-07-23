import { Category } from '../../database/entities/worker.entity';

/**
 * Phrase → tip mapping sheet (from the content pack). Lets the bot understand
 * messy real messages in English, Twi and mixed. Language team should keep
 * adding rows. Used to match an on-demand pain message to one of the 9 tips.
 */
export interface PhraseRule {
  category: Category;
  bodyPart: string;
  tipId: string;
  phrases: string[];
}

export const PHRASE_MAP: PhraseRule[] = [
  { category: 'load', bodyPart: 'back', tipId: 'L1', phrases: ['my back de pain', 'back pain', 'waist dey burn', 'me sisi yare', 'waist pain', 'back hurt'] },
  { category: 'load', bodyPart: 'back/carry', tipId: 'L2', phrases: ['load too heavy', 'the load too heavy', 'adesoa no mu yɛ duru', 'too heavy to carry'] },
  { category: 'load', bodyPart: 'neck', tipId: 'L3', phrases: ['my neck de pain', 'me kɔn yare', 'head load hurt my neck', 'neck pain from carrying'] },
  { category: 'hand', bodyPart: 'wrist', tipId: 'H1', phrases: ['my wrist de pain', 'me nsa mu yare', 'wrist hurt when i sew', 'wrist pain'] },
  { category: 'hand', bodyPart: 'hand/grip', tipId: 'H2', phrases: ['my hand tire', 'fingers de lock', 'me nsa abrɛ', 'hand tired', 'grip pain'] },
  { category: 'hand', bodyPart: 'fingers', tipId: 'H3', phrases: ['fingers stiff', 'nsateaa no yɛ den', 'stiff fingers'] },
  { category: 'sitting', bodyPart: 'lower back', tipId: 'S1', phrases: ['sitting too long de pain my back', 'me akyi yare', 'back pain from sitting'] },
  { category: 'sitting', bodyPart: 'general', tipId: 'S2', phrases: ['i sit whole day', 'metena fam daa', 'sit all day', 'sitting whole day'] },
  { category: 'sitting', bodyPart: 'neck/eyes', tipId: 'S3', phrases: ['neck de pain from phone', 'screen tire my eyes', 'neck pain from screen'] },
];

export interface PhraseMatch {
  tipId: string;
  category: Category;
  bodyPart: string;
}

/** Best phrase match for a message, or null. */
export function matchPhrase(message: string): PhraseMatch | null {
  const text = message.toLowerCase();
  for (const rule of PHRASE_MAP) {
    for (const phrase of rule.phrases) {
      if (text.includes(phrase.toLowerCase())) {
        return { tipId: rule.tipId, category: rule.category, bodyPart: rule.bodyPart };
      }
    }
  }
  return null;
}
