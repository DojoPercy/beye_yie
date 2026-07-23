import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PgBossService } from '../messaging/pg-boss.service';
import { INBOUND_QUEUE } from '../messaging/queues';
import { NormalizedInbound } from '../whatsapp/whatsapp.types';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { PipelineService } from './pipeline.service';

/**
 * Consumes the inbound queue: runs each message through the OT pipeline and
 * sends the reply. Registered as a pg-boss worker on startup.
 */
@Injectable()
export class InboundProcessor implements OnModuleInit {
  private readonly logger = new Logger(InboundProcessor.name);

  constructor(
    private readonly boss: PgBossService,
    private readonly pipeline: PipelineService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.boss.work<NormalizedInbound>(INBOUND_QUEUE, (data) => this.handle(data), 10);
  }

  private async handle(inbound: NormalizedInbound): Promise<void> {
    try {
      const { to, messages } = await this.pipeline.process(inbound);
      await this.whatsapp.sendMany(to, messages);
    } catch (err) {
      this.logger.error(`pipeline failed for ${inbound.phone}: ${(err as Error).message}`, (err as Error).stack);
    }
  }
}
