import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AppConfig } from '../../config/configuration';
import { createChatModel, llmConfigured } from '../llm/chat-model.factory';
import { runRedFlagRules } from './red-flag.rules';

export interface RedFlagResult {
  isRedFlag: boolean;
  reason: string;
  source: 'rules' | 'llm' | 'none';
}

const BACKSTOP_PROMPT = `You are a safety classifier for a preventive occupational-therapy WhatsApp bot used by market women and manual workers in Ghana. Messages may be in English, Twi, Ghanaian Pidgin, or a mix.

Decide if the message shows any RED FLAG that needs a real health professional, NOT self-care advice:
- severe or sudden pain
- numbness, tingling, or weakness
- can't move a limb, can't bear weight, can't work
- pain after a fall, accident or injury
- swelling, or fever with the pain
- chest pain or difficulty breathing
- loss of bladder or bowel control
- pain lasting weeks and getting worse, night pain, or unexplained weight loss

Reply with ONLY a compact JSON object: {"redFlag": true|false, "reason": "<short reason or empty>"}. No other text.`;

/**
 * The safety gate. Runs BEFORE any advice is generated (architecture plan §02).
 * Two layers — deterministic rules first (cheap, high-recall), then an LLM
 * backstop for phrasings the keywords miss. Either one firing = red flag.
 */
@Injectable()
export class RedFlagService {
  private readonly logger = new Logger(RedFlagService.name);

  constructor(private readonly config: ConfigService) {}

  async check(message: string): Promise<RedFlagResult> {
    if (!message?.trim()) return { isRedFlag: false, reason: '', source: 'none' };

    // Layer 1 — deterministic rules.
    const rules = runRedFlagRules(message);
    if (rules.matched) {
      return { isRedFlag: true, reason: rules.reason, source: 'rules' };
    }

    // Layer 2 — LLM backstop (only if a model is configured).
    const llm = this.config.get<AppConfig['llm']>('llm')!;
    if (!llmConfigured(llm)) {
      return { isRedFlag: false, reason: '', source: 'none' };
    }

    try {
      const model = createChatModel(llm, { temperature: 0 });
      const res = await model.invoke([
        new SystemMessage(BACKSTOP_PROMPT),
        new HumanMessage(message),
      ]);
      const raw = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
      const parsed = this.parse(raw);
      if (parsed.redFlag) {
        return { isRedFlag: true, reason: parsed.reason || 'llm-backstop', source: 'llm' };
      }
    } catch (err) {
      // Fail safe-but-usable: a classifier outage must not block all replies,
      // but the deterministic rules above still ran. Log and continue.
      this.logger.warn(`red-flag backstop error: ${(err as Error).message}`);
    }

    return { isRedFlag: false, reason: '', source: 'none' };
  }

  private parse(raw: string): { redFlag: boolean; reason: string } {
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return { redFlag: false, reason: '' };
      const obj = JSON.parse(match[0]);
      return { redFlag: !!obj.redFlag, reason: String(obj.reason ?? '') };
    } catch {
      return { redFlag: false, reason: '' };
    }
  }
}
