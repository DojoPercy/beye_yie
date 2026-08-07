import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Worker } from '../database/entities/worker.entity';
import { WorkerService } from '../agent/worker/worker.service';
import {
  DAILY_CHECK_IN_START,
  DailyCheckInService,
} from '../agent/checkin/daily-check-in.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { WhatsAppOutbound } from '../whatsapp/whatsapp.types';

/**
 * Daily check-in prompt (spec §3). Sweeps every 5 minutes and prompts each
 * worker once, at her own `checkInTime` (Accra = UTC, no DST).
 *
 * Business-initiated messages outside the 24h window need an APPROVED
 * template, so the production path sends a template whose quick-reply carries
 * the `dci_start` payload; tapping it opens the window and the conversational
 * questions follow. Without a configured template the first question is sent
 * directly, which works in dev and inside an already-open window.
 */
@Injectable()
export class DailyCheckInSchedulerService {
  private readonly logger = new Logger(DailyCheckInSchedulerService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly workers: WorkerService,
    private readonly checkIns: DailyCheckInService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep(): Promise<void> {
    if (!this.config.get<boolean>('scheduler.dailyCheckInsEnabled')) return;

    const now = new Date();
    const hhmm = now.toISOString().slice(11, 16);
    const today = DailyCheckInService.today(now);

    for (const worker of await this.workers.all()) {
      if (!worker.onboarded) continue;
      // Don't interrupt the initial assessment with a daily check-in.
      if (!worker.assessmentCompletedAt) continue;
      if (!worker.lastVerifiedInboundAt) {
        this.logger.warn('skipped daily check-in for a recipient without verified inbound consent');
        continue;
      }
      if (worker.lastDailyCheckInDate === today) continue;
      if (!this.timeMatches(worker.checkInTime, hhmm)) continue;

      await this.prompt(worker, today);
    }
  }

  private async prompt(worker: Worker, today: string): Promise<void> {
    const template = this.config.get<string>(`dailyCheckInTemplate.${worker.language}`);

    if (template) {
      const sent = await this.whatsapp.sendMany(worker.userId, [
        {
          type: 'template',
          name: template,
          language: worker.language === 'tw' ? 'tw' : 'en',
          bodyParams: [worker.name ?? ''],
          quickReplyPayloads: [DAILY_CHECK_IN_START],
        },
      ]);
      if (!sent) {
        this.logger.error('daily check-in template was not sent; will retry on the next sweep');
        return;
      }
      // The state machine starts when she taps, not when we send — otherwise
      // an ignored prompt would leave her stuck mid-flow tomorrow.
      worker.lastDailyCheckInDate = today;
      await this.workers.save(worker);
      this.logger.log(`daily check-in prompt → ${worker.userId}`);
      return;
    }

    const messages: WhatsAppOutbound[] = await this.checkIns.begin(worker, today);
    const sent = await this.whatsapp.sendMany(worker.userId, messages);
    if (sent) {
      this.logger.log(`daily check-in → ${worker.userId}`);
      return;
    }
    // Roll back so the sweep can try again rather than silently skipping a day.
    worker.dailyCheckInStep = null;
    worker.lastDailyCheckInDate = null;
    await this.workers.save(worker);
    this.logger.error('daily check-in was not sent; state was rolled back');
  }

  /** Match within the 5-minute sweep window so we never miss the slot. */
  private timeMatches(checkInTime: string, nowHhmm: string): boolean {
    const toMin = (s: string) => {
      const [h, m] = s.split(':').map(Number);
      return h * 60 + m;
    };
    const diff = toMin(nowHhmm) - toMin(checkInTime);
    return diff >= 0 && diff < 5;
  }
}
