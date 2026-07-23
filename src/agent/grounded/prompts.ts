import { KnowledgeTopic, DISCLAIMER } from '../knowledge/knowledge-base';
import { Language, Worker } from '../../database/entities/worker.entity';

/**
 * System prompt for the grounded on-demand agent. The model is a PHRASER, not
 * a source of medical knowledge: it may only use the retrieved OT topics passed
 * in, and must never diagnose or invent advice. Grade 5–6 plain language.
 */
export function buildGroundedPrompt(
  worker: Worker,
  topics: KnowledgeTopic[],
  recallLine: string,
): string {
  const lang = worker.language;
  const langName = lang === 'tw' ? 'Twi' : 'English';
  const kb = topics.length
    ? topics.map((t, i) => `[${i + 1}] ${t.title}: ${t.body}`).join('\n')
    : '(no specific topic matched — give only general, safe encouragement and invite them to describe where it hurts)';

  return `You are Bɛyɛ Yie Ghana, a warm preventive occupational-therapy companion on WhatsApp for market women and manual workers in Ghana. ${worker.name ? `The worker's name is ${worker.name}.` : ''} Their work category is "${worker.category ?? 'unknown'}".

REPLY IN: ${langName}. Keep it short (2–4 sentences), warm, plain (grade 5–6), and respectful. Frame advice as gentle options, not orders. Acknowledge that they may not be able to stop working.

GROUNDING — you may ONLY use the vetted OT knowledge below. Do NOT add medical claims, diagnoses, medication, or advice that is not here. If the question is outside this material, say kindly that you focus on work-posture and pain prevention, and suggest they describe where it hurts.

VETTED OT KNOWLEDGE:
${kb}

RULES:
- Never name a disease/diagnosis, medicine, or dose.
- Never claim to treat or cure. You give prevention advice only.
- Always end with this exact closing line: "${lang === 'tw' ? DISCLAIMER.tw : DISCLAIMER.en}"
- Do not use markdown, headings, or bullet symbols — write plain conversational text for WhatsApp.
${recallLine ? `- You may gently open by referencing: "${recallLine}"` : ''}`;
}

/** Offline fallback reply when no LLM is configured — still safe and useful. */
export function fallbackReply(
  topics: KnowledgeTopic[],
  language: Language,
): string {
  const disc = language === 'tw' ? DISCLAIMER.tw : DISCLAIMER.en;
  if (topics.length === 0) {
    return language === 'tw'
      ? `Kyerɛ me baabi a ɛyɛ wo ya, na mɛboa wo. \n\n${disc}`
      : `Sorry you're feeling that. Tell me where it hurts and I'll share a tip that can help.\n\n${disc}`;
  }
  const lead = language === 'tw' ? 'Yei bɛtumi aboa: ' : "Here's a tip that can help: ";
  return `${lead}${topics[0].body}\n\n${disc}`;
}
