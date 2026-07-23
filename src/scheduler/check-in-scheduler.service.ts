import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Worker, Category } from '../database/entities/worker.entity';
import { WorkerService } from '../agent/worker/worker.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { WhatsAppOutbound } from '../whatsapp/whatsapp.types';

/** Default body part to ask about, per work category. */
const BODY_PART: Record<Category, string> = {
  load: 'back',
  hand: 'wrist',
  sitting: 'neck',
};

/**
 * Weekly check-in (content pack §8). Once a week, ask "How is your [body part]
 * this week?" with 1/2/3 buttons. Replies are routed by the pipeline into
 * CheckIn events that feed personalization and the impact dashboard.
 */
@Injectable()
export class CheckInSchedulerService {
  private readonly logger = new Logger(CheckInSchedulerService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly workers: WorkerService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  /** Mondays at 09:00 UTC (≈ Accra). */
  @Cron('0 9 * * 1')
  async weekly(): Promise<void> {
    // Gated: proactive check-ins need approved WhatsApp templates.
    if (!this.config.get<boolean>('scheduler.checkInsEnabled')) return;

    const all = await this.workers.all();
    for (const worker of all) {
      if (!worker.onboarded) continue;
      await this.whatsapp.sendMany(worker.userId, [this.buildCheckIn(worker)]);
      this.logger.log(`weekly check-in → ${worker.userId}`);
    }
  }

  private buildCheckIn(worker: Worker): WhatsAppOutbound {
    const part = BODY_PART[(worker.category ?? 'load') as Category];
    const lang = worker.language;
    return {
      type: 'buttons',
      body:
        lang === 'tw'
          ? `Nnawɔtwe yi, wo ${part} ho te sɛn?`
          : `Quick check 🌿 How is your ${part} this week?`,
      buttons: [
        { id: `checkin_${part}_worse`, title: lang === 'tw' ? 'Ɛkɔ so' : 'Worse' },
        { id: `checkin_${part}_same`, title: lang === 'tw' ? 'Saa ara' : 'Same' },
        { id: `checkin_${part}_better`, title: lang === 'tw' ? 'Ɛyɛ' : 'Better' },
      ],
    };
  }
}
