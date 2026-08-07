/**
 * Text folding for Ghanaian-language matching.
 *
 * Workers type Twi on a phone keyboard that has no ɛ, ɔ or ŋ, so the same word
 * arrives as "ɛyɛ me ya", "eye me ya" or "3y3 me ya". Fold everything to a
 * plain-ASCII form once, and write all Twi/Pidgin patterns in that form so a
 * single pattern covers every spelling a worker might send.
 *
 * English is unaffected by folding, so rules for both languages can run over
 * the same folded string.
 */
export function foldGhanaian(input: string): string {
  return (input ?? '')
    .normalize('NFD')
    // Drop the combining accents (á → a) that NFD leaves behind.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ɛƐ]/g, 'e') // ɛ Ɛ
    .replace(/[ɔƆ]/g, 'o') // ɔ Ɔ
    .replace(/[ŋŊ]/g, 'ng') // ŋ Ŋ
    .toLowerCase();
}

/**
 * As {@link foldGhanaian}, plus the digit-for-vowel substitutions people use
 * when the keyboard has no ɛ/ɔ ("3y3" for "ɛyɛ", "n)" for "nɔ").
 *
 * This destroys digits, so use it only for keyword matching — never before
 * reading a pain score out of a message.
 */
export function foldGhanaianLoose(input: string): string {
  return foldGhanaian(input)
    .replace(/3/g, 'e')
    .replace(/\)/g, 'o');
}
