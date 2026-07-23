import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PgBossService } from '../messaging/pg-boss.service';
import { INBOUND_QUEUE } from '../messaging/queues';
import { ProcessedMessage } from '../database/entities/processed-message.entity';
import { NormalizedInbound } from '../whatsapp/whatsapp.types';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { PipelineService } from './pipeline.service';

/**
 * Consumes the inbound queue: dedupes Meta retries, marks the message read +
 * shows typing, runs the OT pipeline, and sends the reply.
 */
@Injectable()
export class InboundProcessor implements OnModuleInit {
  private readonly logger = new Logger(InboundProcessor.name);

  constructor(
    private readonly boss: PgBossService,
    private readonly pipeline: PipelineService,
    private readonly whatsapp: WhatsAppService,
    @InjectRepository(ProcessedMessage)
    private readonly processed: Repository<ProcessedMessage>,
  ) {}

  async onModuleInit(): Promise<void> {
    // Concurrency 1: a small instance handles one LLM turn at a time, which
    // (with idempotency) prevents the concurrent-call starvation that was
    // truncating replies. Raise this once the instance is bigger.
    await this.boss.work<NormalizedInbound>(INBOUND_QUEUE, (data) => this.handle(data), 1);
  }

  private async handle(inbound: NormalizedInbound): Promise<void> {
    // ── Idempotency: claim this Meta message id atomically. If it's already
    // claimed (a webhook retry), skip — don't reprocess or re-reply. ──
    if (inbound.messageId) {
      const claim = await this.processed
        .createQueryBuilder()
        .insert()
        .into(ProcessedMessage)
        .values({ messageId: inbound.messageId })
        .orIgnore()
        .execute();
      const isNew = (claim.identifiers?.length ?? 0) > 0 || (claim.raw?.length ?? 0) > 0;
      if (!isNew) {
        this.logger.debug(`duplicate message ${inbound.messageId} — skipping`);
        return;
      }
    }

    // Read receipt + typing indicator (best effort, non-blocking semantics).
    await this.whatsapp.markReadAndTyping(inbound.messageId);

    try {
      const { to, messages } = await this.pipeline.process(inbound);
      await this.whatsapp.sendMany(to, messages);
    } catch (err) {
      this.logger.error(
        `pipeline failed for ${inbound.phone}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
