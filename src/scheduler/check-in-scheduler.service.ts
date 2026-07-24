import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Worker, Category, WorkActivity } from '../database/entities/worker.entity';
import { WorkerService } from '../agent/worker/worker.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { WhatsAppOutbound } from '../whatsapp/whatsapp.types';

/** Default body part to ask about, per work category. */
const BODY_PART: Record<Category, string> = {
  load: 'back',
  hand: 'wrist',
  sitting: 'neck',
};

/** A more specific check-in when the worker chose a main market-work activity. */
const BODY_PART_BY_ACTIVITY: Record<WorkActivity, string> = {
  carrying: 'back',
  head_loading: 'neck',
  standing_walking: 'legs and feet',
  bending_squatting: 'knees and back',
  repetitive_hand_work: 'wrist and hand',
  sitting_leaning: 'lower back and neck',
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
      if (!worker.lastVerifiedInboundAt) {
        this.logger.warn('skipped weekly check-in for a recipient without verified inbound consent');
        continue;
      }
      const sent = await this.whatsapp.sendMany(worker.userId, [this.buildCheckIn(worker)]);
      if (sent) this.logger.log(`weekly check-in → ${worker.userId}`);
      else this.logger.error('weekly check-in was not sent');
    }
  }

  private buildCheckIn(worker: Worker): WhatsAppOutbound {
    const part = worker.workActivity
      ? BODY_PART_BY_ACTIVITY[worker.workActivity]
      : BODY_PART[(worker.category ?? 'load') as Category];
    const partId = part.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '');
    const lang = worker.language;
    return {
      type: 'buttons',
      body:
        lang === 'tw'
          ? `Nnawɔtwe yi, wo ${part} ho te sɛn?`
          : `Quick check 🌿 How is your ${part} this week?`,
      buttons: [
        { id: `checkin_${partId}_worse`, title: lang === 'tw' ? 'Ɛkɔ so' : 'Worse' },
        { id: `checkin_${partId}_same`, title: lang === 'tw' ? 'Saa ara' : 'Same' },
        { id: `checkin_${partId}_better`, title: lang === 'tw' ? 'Ɛyɛ' : 'Better' },
      ],
    };
  }
}
