import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppConfig } from '../../config/configuration';
import { Worker } from '../../database/entities/worker.entity';
import { ConversationTurn } from '../../database/entities/conversation-turn.entity';
import { createChatModel, llmConfigured } from '../llm/chat-model.factory';
import { matchTopics } from '../knowledge/knowledge-base';
import { matchPhrase } from '../knowledge/phrase-map';
import { PersonalizationService } from '../personalization/personalization.service';
import { buildGroundedPrompt, fallbackReply } from './prompts';

export interface GroundedResult {
  reply: string;
  matchedTipId: string | null;
}

/**
 * Layer ② — the grounded on-demand agent. Retrieval is deterministic (keyword
 * match over the vetted KB + phrase→tip map); the LLM only phrases a warm reply
 * from that retrieved material and never free-associates. Conversation memory
 * is the recent turn log for this worker. If no LLM is configured, a safe
 * template fallback is returned so the bot still works offline.
 */
@Injectable()
export class GroundedAgentService {
  private readonly logger = new Logger(GroundedAgentService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly personalization: PersonalizationService,
    @InjectRepository(ConversationTurn)
    private readonly turns: Repository<ConversationTurn>,
  ) {}

  async answer(worker: Worker, message: string): Promise<GroundedResult> {
    // Deterministic retrieval.
    const phrase = matchPhrase(message);
    const topics = matchTopics(message, worker.category, 3);
    const matchedTipId = phrase?.tipId ?? null;

    // Record the pain report for personalization + impact (if it reads like one).
    if (phrase) {
      await this.personalization.recordPain(
        worker.userId,
        phrase.bodyPart,
        phrase.category,
        phrase.tipId,
        this.parseNrs(message),
      );
    }

    const recallLine = await this.personalization.recallLine(worker.userId, worker.language);

    const llm = this.config.get<AppConfig['llm']>('llm')!;
    if (!llmConfigured(llm)) {
      return { reply: fallbackReply(topics, worker.language), matchedTipId };
    }

    try {
      // Enough headroom for a 2–4 sentence reply plus the closing disclaimer.
      const model = createChatModel(llm, { temperature: 0.3, maxTokens: 500 });
      const history = await this.recentHistory(worker.userId);
      const prompt = [
        new SystemMessage(buildGroundedPrompt(worker, topics, recallLine)),
        ...history,
        new HumanMessage(message),
      ];

      // Guard against truncated output: on a constrained host an interrupted
      // request can return half-generated text. A complete reply always carries
      // its closing disclaimer — if it doesn't, retry once, then fall back to
      // safe template text. A worker must NEVER receive a sentence cut mid-word.
      let reply = await this.invokeText(model, prompt);
      if (!this.looksComplete(reply, worker.language)) {
        this.logger.warn('grounded reply looked truncated — retrying once');
        reply = await this.invokeText(model, prompt);
      }
      if (!this.looksComplete(reply, worker.language)) {
        this.logger.warn('grounded reply still truncated — using safe fallback');
        return { reply: fallbackReply(topics, worker.language), matchedTipId };
      }
      return { reply, matchedTipId };
    } catch (err) {
      this.logger.error(`grounded agent error: ${(err as Error).message}`);
      return { reply: fallbackReply(topics, worker.language), matchedTipId };
    }
  }

  private async invokeText(
    model: ReturnType<typeof createChatModel>,
    prompt: (SystemMessage | HumanMessage | AIMessage)[],
  ): Promise<string> {
    const res = await model.invoke(prompt);
    const content = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
    return content.trim();
  }

  /**
   * A complete grounded reply always ends with its closing disclaimer (the
   * prompt mandates it). If the disclaimer marker is missing, the reply was
   * cut off before finishing.
   */
  private looksComplete(reply: string, language: 'tw' | 'en'): boolean {
    if (!reply) return false;
    const marker = language === 'tw' ? 'ayaresa' : 'medical treatment';
    return reply.toLowerCase().includes(marker.toLowerCase());
  }

  /** Last few turns as chat messages, for lightweight conversational memory. */
  private async recentHistory(userId: string): Promise<(HumanMessage | AIMessage)[]> {
    const rows = await this.turns.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 4,
    });
    const msgs: (HumanMessage | AIMessage)[] = [];
    for (const t of rows.reverse()) {
      if (t.inbound) msgs.push(new HumanMessage(t.inbound));
      if (t.outbound) msgs.push(new AIMessage(t.outbound));
    }
    return msgs;
  }

  /** Extract an explicit 0–10 pain score if the worker stated one. */
  private parseNrs(message: string): number | null {
    const m = message.match(/\b(10|[0-9])\s*(?:\/\s*10|out of 10)?\b/);
    if (!m) return null;
    const n = Number(m[1]);
    return n >= 0 && n <= 10 ? n : null;
  }
}
