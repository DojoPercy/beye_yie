import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Worker } from '../database/entities/worker.entity';
import { Tip } from '../database/entities/tip.entity';
import { WorkerService } from '../agent/worker/worker.service';
import { PersonalizationService } from '../agent/personalization/personalization.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { WhatsAppOutbound } from '../whatsapp/whatsapp.types';

/**
 * Layer ① — the periodic push. Every few minutes, send the daily tip to any
 * worker whose chosen tip_time has arrived (Accra = UTC, no DST) and who has
 * not received one today. Respects frequency (daily / alternate / weekly).
 *
 * Business-initiated messages outside the 24h window require an APPROVED
 * utility template (plan §03). If a tip has templateName set we send the
 * template; otherwise we send text (works in dev / inside an open window, and
 * flags the template dependency for production).
 */
@Injectable()
export class TipSchedulerService {
  private readonly logger = new Logger(TipSchedulerService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly workers: WorkerService,
    private readonly personalization: PersonalizationService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  /** Sweeps every 5 minutes; each worker fires once at their tip_time. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep(): Promise<void> {
    const now = new Date();
    const hhmm = now.toISOString().slice(11, 16); // UTC == Africa/Accra
    const today = now.toISOString().slice(0, 10);

    const all = await this.workers.all();
    for (const worker of all) {
      if (!worker.onboarded) continue;
      if (worker.lastTipDate === today) continue;
      if (!this.isDue(worker, now)) continue;
      if (!this.timeMatches(worker.tipTime, hhmm)) continue;

      await this.sendDailyTip(worker, today);
    }
  }

  private async sendDailyTip(worker: Worker, today: string): Promise<void> {
    const tip = await this.personalization.pickDailyTip(worker);
    if (!tip) return;

    const messages = this.buildTipMessages(worker, tip);
    await this.whatsapp.sendMany(worker.userId, messages);

    await this.personalization.logDelivery(worker.userId, tip.id);
    worker.lastTipDate = today;
    worker.tipCursor = (worker.tipCursor + 1) % 3;
    await this.workers.save(worker);

    const streak = await this.personalization.streakDays(worker.userId);
    this.logger.log(`daily tip ${tip.id} → ${worker.userId} (streak ${streak}d)`);
  }

  private buildTipMessages(worker: Worker, tip: Tip): WhatsAppOutbound[] {
    const messages: WhatsAppOutbound[] = [];

    if (tip.templateName) {
      // Production path — approved utility template (business-initiated).
      messages.push({
        type: 'template',
        name: tip.templateName,
        language: worker.language === 'tw' ? 'tw' : 'en',
        bodyParams: [worker.name ?? ''],
      });
    } else {
      const text = worker.language === 'tw' ? tip.textTw : tip.textEn;
      const hi = worker.name ? `${worker.name}, ` : '';
      messages.push({ type: 'text', body: `🌿 ${hi}${text}` });
    }

    // Attach audio if a public base URL is configured for the recorded files.
    const base = this.config.get<string>('AUDIO_BASE_URL') || process.env.AUDIO_BASE_URL;
    const file = worker.language === 'tw' ? tip.audioTwUrl : tip.audioEnUrl;
    if (base && file) {
      messages.push({ type: 'audio', link: `${base.replace(/\/$/, '')}/${file}` });
    }
    return messages;
  }

  /** Frequency gate: daily always; alternate every 2 days; weekly on day 0. */
  private isDue(worker: Worker, now: Date): boolean {
    if (worker.frequency === 'daily') return true;
    const days = Math.floor((now.getTime() - new Date(worker.signupDate).getTime()) / 86_400_000);
    if (worker.frequency === 'alternate') return days % 2 === 0;
    if (worker.frequency === 'weekly') return days % 7 === 0;
    return true;
  }

  /** Match within the 5-minute sweep window so we never miss the slot. */
  private timeMatches(tipTime: string, nowHhmm: string): boolean {
    const toMin = (s: string) => {
      const [h, m] = s.split(':').map(Number);
      return h * 60 + m;
    };
    const diff = toMin(nowHhmm) - toMin(tipTime);
    return diff >= 0 && diff < 5;
  }
}
