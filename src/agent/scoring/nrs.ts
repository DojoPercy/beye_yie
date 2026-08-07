/**
 * Numeric Rating Scale (0–10) extraction from free text.
 *
 * A bare digit in a WhatsApp message is almost never a pain score — "I worked
 * 8 hours", "I sold 5 baskets", "call me on 0244…". Accept a number only when
 * it is explicitly framed as a rating: an out-of-ten form, or a number sitting
 * next to a pain word and not attached to a unit of something else.
 *
 * Shared by the grounded agent, the assessment flow and the daily check-in so
 * every severity that reaches `pain_events` means the same thing.
 */

/** "8/10", "8 out of 10" — unambiguous on its own. */
const OUT_OF_TEN = /\b(10|[0-9])\s*(?:\/|\s+out\s+of\s+)\s*10\b/i;

/** Any standalone 0–10. Word boundaries keep it out of phone numbers. */
const STANDALONE = /\b(10|[0-9])\b/g;

/**
 * Pain vocabulary in English, Twi and Ghanaian Pidgin. `ya`/`yaw`/`yare` are
 * the Twi pain words; they are matched whole so they don't fire inside
 * unrelated words.
 */
const PAIN_NEAR =
  /\b(?:pain|pains|painful|ache|aches|aching|hurt|hurts|hurting|sore|soreness|severity|severe|score|scale|level|rate|rating|ya|yaw|yare|eye)\b/i;

/** A number carrying a unit is measuring something else, not severity. */
const UNIT_AFTER =
  /^\s*(?:hours?|hrs?|h\b|days?|dys?|weeks?|wks?|months?|mths?|years?|yrs?|minutes?|mins?|times?|x\b|kilos?|kgs?|kg\b|pounds?|lbs?|cedis?|ghs?|baskets?|bags?|boxes|bowls?|children|kids|people|am\b|pm\b|o'?clock|:|\d)/i;

/** How far either side of the number to look for a pain word. */
const LOOK_BEHIND = 24;
const LOOK_AHEAD = 16;

/**
 * Extract an explicit 0–10 pain rating, or null when the worker did not give
 * one. Never guesses: a missing score is far better than a wrong one, because
 * these values drive trend detection and referral thresholds.
 */
export function parseNrs(message: string): number | null {
  if (!message) return null;
  const text = message.toLowerCase();

  const outOfTen = text.match(OUT_OF_TEN);
  if (outOfTen) return Number(outOfTen[1]);

  for (const match of text.matchAll(STANDALONE)) {
    const index = match.index ?? 0;
    const after = text.slice(index + match[1].length, index + match[1].length + LOOK_AHEAD);
    if (UNIT_AFTER.test(after)) continue;

    const before = text.slice(Math.max(0, index - LOOK_BEHIND), index);
    if (PAIN_NEAR.test(before) || PAIN_NEAR.test(after)) return Number(match[1]);
  }

  return null;
}

/**
 * A reply to a direct "rate your pain 0–10" question, where a bare number is
 * exactly what was asked for. Falls back to {@link parseNrs} for workers who
 * answer in a sentence instead of tapping a number.
 */
export function parseNrsAnswer(message: string): number | null {
  const trimmed = (message ?? '').trim();
  const bare = trimmed.match(/^(10|[0-9])$/);
  if (bare) return Number(bare[1]);
  return parseNrs(trimmed);
}
