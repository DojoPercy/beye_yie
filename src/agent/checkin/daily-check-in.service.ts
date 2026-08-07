import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DailyCheckIn } from '../../database/entities/daily-check-in.entity';
import { Language, Worker } from '../../database/entities/worker.entity';
import { NormalizedInbound, WhatsAppOutbound } from '../../whatsapp/whatsapp.types';
import { WorkerService } from '../worker/worker.service';
import { EscalationService } from '../escalation/escalation.service';
import { TrendService } from '../trends/trend.service';
import { parseNrsAnswer } from '../scoring/nrs';

/** Pick copy by language without a translation framework. */
const t = (lang: Language, en: string, tw: string) => (lang === 'tw' ? tw : en);

/** Reply-id prefix for every daily-check-in interaction. */
export const DAILY_CHECK_IN_PREFIX = 'dci_';

/** Quick-reply payload on the proactive template that opens the check-in. */
export const DAILY_CHECK_IN_START = 'dci_start';

/**
 * The daily check-in (spec §3):
 *
 *   pain today (0–10) → did you work? → did you lift heavy loads?
 *                     → did you do your stretches?
 *
 * Four taps, deterministic, no LLM. Answers are written as they arrive, so a
 * worker who stops after the first question still leaves a usable pain point
 * for trend detection.
 *
 * The prompt is issued by DailyCheckInSchedulerService; this service owns the
 * conversation once she replies.
 */
@Injectable()
export class DailyCheckInService {
  private readonly logger = new Logger(DailyCheckInService.name);

  constructor(
    @InjectRepository(DailyCheckIn) private readonly checkIns: Repository<DailyCheckIn>,
    private readonly workers: WorkerService,
    private readonly trends: TrendService,
    private readonly escalation: EscalationService,
  ) {}

  /** Accra calendar day (UTC == Africa/Accra, no DST). */
  static today(now = new Date()): string {
    return now.toISOString().slice(0, 10);
  }

  /** Does this reply belong to the daily check-in flow? */
  owns(worker: Worker, replyId: string): boolean {
    return replyId.startsWith(DAILY_CHECK_IN_PREFIX) || worker.dailyCheckInStep !== null;
  }

  /** Open today's check-in and ask the first question. */
  async begin(worker: Worker, day = DailyCheckInService.today()): Promise<WhatsAppOutbound[]> {
    await this.rowFor(worker.userId, day);
    worker.dailyCheckInStep = 'pain';
    worker.lastDailyCheckInDate = day;
    await this.workers.save(worker);
    return [this.askPain(worker.language)];
  }

  /**
   * Handle one reply in the daily check-in.
   *
   * Returns an empty array when the worker is plainly asking something rather
   * than answering, so the pipeline can route her to the grounded agent. Being
   * mid-check-in must never trap her in a loop of the same question.
   */
  async handle(worker: Worker, inbound: NormalizedInbound): Promise<WhatsAppOutbound[]> {
    const choice = (inbound.replyId ?? inbound.text ?? '').trim();

    if (choice === DAILY_CHECK_IN_START || !worker.dailyCheckInStep) {
      return this.begin(worker);
    }

    if (!inbound.replyId && this.looksLikeQuestion(inbound.text ?? '')) {
      worker.dailyCheckInStep = null;
      await this.workers.save(worker);
      return [];
    }

    const day = worker.lastDailyCheckInDate ?? DailyCheckInService.today();
    const row = await this.rowFor(worker.userId, day);

    switch (worker.dailyCheckInStep) {
      case 'pain': {
        const nrs = this.parsePain(choice, inbound.text ?? '');
        if (nrs === null) return [this.askPain(worker.language)];
        row.nrs = nrs;
        await this.checkIns.save(row);
        return this.advance(worker, 'worked', this.askWorked(worker.language));
      }

      case 'worked': {
        const yes = this.parseYesNo(choice, 'worked');
        if (yes === null) return [this.askWorked(worker.language)];
        row.worked = yes;
        await this.checkIns.save(row);
        // She did not work today, so the heavy-lifting question cannot apply.
        if (!yes) {
          row.liftedHeavy = false;
          await this.checkIns.save(row);
          return this.advance(worker, 'exercises', this.askExercises(worker.language));
        }
        return this.advance(worker, 'lifted', this.askLifted(worker.language));
      }

      case 'lifted': {
        const yes = this.parseYesNo(choice, 'lift');
        if (yes === null) return [this.askLifted(worker.language)];
        row.liftedHeavy = yes;
        await this.checkIns.save(row);
        return this.advance(worker, 'exercises', this.askExercises(worker.language));
      }

      case 'exercises': {
        const yes = this.parseYesNo(choice, 'ex');
        if (yes === null) return [this.askExercises(worker.language)];
        row.didExercises = yes;
        row.completedAt = new Date();
        await this.checkIns.save(row);

        worker.dailyCheckInStep = null;
        await this.workers.save(worker);
        this.logger.log(`daily check-in complete for ${worker.userId} (${day})`);

        const messages: WhatsAppOutbound[] = [
          { type: 'text', body: this.closingFor(row, worker.language) },
        ];

        // Spec §4 — the day's answers just changed her trend, so this is the
        // moment to notice symptoms heading the wrong way.
        const alert = await this.trends.detectAlert(worker.userId);
        if (alert.refer) {
          messages.push({ type: 'text', body: this.worseningNotice(worker.language) });
          messages.push(
            ...(await this.escalation.referRoutine(
              worker.userId,
              'trend',
              alert.reasons.join('; '),
              worker.language,
            )),
          );
        }

        return messages;
      }

      default:
        worker.dailyCheckInStep = null;
        await this.workers.save(worker);
        return [];
    }
  }

  /** Today's row, created on first use. */
  private async rowFor(userId: string, day: string): Promise<DailyCheckIn> {
    const existing = await this.checkIns.findOne({ where: { userId, day } });
    if (existing) return existing;
    return this.checkIns.save(this.checkIns.create({ userId, day }));
  }

  private async advance(
    worker: Worker,
    step: string,
    question: WhatsAppOutbound,
  ): Promise<WhatsAppOutbound[]> {
    worker.dailyCheckInStep = step;
    await this.workers.save(worker);
    return [question];
  }

  /**
   * A short, specific sign-off. Generic praise every single day stops landing,
   * so the message reflects what she actually reported.
   */
  private closingFor(row: DailyCheckIn, lang: Language): string {
    if (row.didExercises) {
      return t(
        lang,
        'Well done for doing your stretches today — that is the part that pays off over weeks, not days. Rest well. 💚',
        'Mo sɛ woyɛɛ wo stretches nnɛ — ɛno ne deɛ ɛboa wɔ nnawɔtwe pii mu. Da yiye. 💚',
      );
    }
    if (row.liftedHeavy) {
      return t(
        lang,
        'Thank you. You carried heavy loads today, so give your back a few minutes of rest and gentle stretching this evening if you can. 💚',
        'Meda wo ase. Wosoaa nneɛma a ɛyɛ duru nnɛ, enti ma wo sisi nhome kakra na yɛ stretching brɛoo anwummerɛ yi. 💚',
      );
    }
    if (row.worked === false) {
      return t(
        lang,
        'Thank you for checking in on your rest day. Rest is part of the work too. 💚',
        'Meda wo ase sɛ wo ne me kasae wɔ w’ahomegye da. Ahomegye nso ka adwuma no ho. 💚',
      );
    }
    return t(
      lang,
      'Thank you for checking in. Small steps each day add up. 💚',
      'Meda wo ase. Nkakrankakra na ɛboa. 💚',
    );
  }

  /**
   * Said before the referral so the handoff doesn't arrive out of nowhere.
   * It names what was noticed, because "we saw your own answers" is easier to
   * act on than an unexplained instruction to see someone.
   */
  private worseningNotice(lang: Language): string {
    return t(
      lang,
      "I've been keeping track of your answers, and your pain has been going the wrong way rather than settling. That's worth someone looking at properly — it doesn't mean anything is seriously wrong.",
      'Mahwɛ wo mmuae no, na wo yaw no rekɔ soro sen sɛ ɛredwo. Ɛfata sɛ obi hwɛ no yiye — ɛnkyerɛ sɛ biribi kɛse asɛe.',
    );
  }

  // ── Questions ──

  private askPain(lang: Language): WhatsAppOutbound {
    return {
      type: 'list',
      body: t(
        lang,
        'Evening check 🌿 How is your pain today? 0 is none, 10 is the worst. Tap a choice or type a number.',
        'Anwummerɛ nsɛmmisa 🌿 Wo yaw no te sɛn nnɛ? 0 kyerɛ sɛ biribiara nni hɔ, 10 kyerɛ sɛ ɛyɛ den paa. Paw baako anaa kyerɛw nɔmba.',
      ),
      button: t(lang, 'Choose', 'Paw'),
      rows: [
        { id: 'dci_pain_0', title: t(lang, 'No pain (0)', 'Ɔyaw nni hɔ (0)') },
        { id: 'dci_pain_2', title: t(lang, 'Mild (1–3)', 'Kakraa (1–3)') },
        { id: 'dci_pain_5', title: t(lang, 'Moderate (4–6)', 'Ɛfa (4–6)') },
        { id: 'dci_pain_8', title: t(lang, 'Severe (7–8)', 'Ɛyɛ den (7–8)') },
        { id: 'dci_pain_10', title: t(lang, 'Worst possible (9–10)', 'Ɛyɛ den paa (9–10)') },
      ],
    };
  }

  private askWorked(lang: Language): WhatsAppOutbound {
    return {
      type: 'buttons',
      body: t(lang, 'Did you work today?', 'Woyɛɛ adwuma nnɛ?'),
      buttons: [
        { id: 'dci_worked_yes', title: t(lang, 'Yes', 'Aane') },
        { id: 'dci_worked_no', title: t(lang, 'No', 'Dabi') },
      ],
    };
  }

  private askLifted(lang: Language): WhatsAppOutbound {
    return {
      type: 'buttons',
      body: t(lang, 'Did you carry or lift heavy loads?', 'Wosoaa nneɛma a ɛyɛ duru?'),
      buttons: [
        { id: 'dci_lift_yes', title: t(lang, 'Yes', 'Aane') },
        { id: 'dci_lift_no', title: t(lang, 'No', 'Dabi') },
      ],
    };
  }

  private askExercises(lang: Language): WhatsAppOutbound {
    return {
      type: 'buttons',
      body: t(
        lang,
        'Did you do your stretches or exercises today?',
        'Woyɛɛ wo stretches anaa exercises nnɛ?',
      ),
      buttons: [
        { id: 'dci_ex_yes', title: t(lang, 'Yes', 'Aane') },
        { id: 'dci_ex_no', title: t(lang, 'Not today', 'Ɛnnɛ deɛ dabi') },
      ],
    };
  }

  // ── Parsers ──

  /**
   * A message that is asking rather than answering. Check-in answers are short
   * — a tap, a number, or a yes/no — so anything with a question mark or of
   * any real length is a request for help, not a reply.
   */
  private looksLikeQuestion(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (/^(10|[0-9])$/.test(trimmed)) return false;
    if (/^(yes|no|aane|dabi|y|n)$/i.test(trimmed)) return false;
    return trimmed.includes('?') || trimmed.length > 20;
  }

  private parsePain(choice: string, rawText: string): number | null {
    const band = choice.toLowerCase().match(/^dci_pain_(\d{1,2})$/);
    if (band) return Number(band[1]);
    return parseNrsAnswer(rawText || choice);
  }

  private parseYesNo(choice: string, tag: string): boolean | null {
    const c = choice.toLowerCase();
    if (c === `dci_${tag}_yes`) return true;
    if (c === `dci_${tag}_no`) return false;
    if (/^(yes|aane|y|1)$/.test(c)) return true;
    if (/^(no|dabi|n|2|not today)$/.test(c)) return false;
    return null;
  }
}
