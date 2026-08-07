import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FunctionRating, FunctionScore } from '../../database/entities/function-score.entity';
import { Language, Worker } from '../../database/entities/worker.entity';
import { NormalizedInbound, WhatsAppOutbound } from '../../whatsapp/whatsapp.types';
import { WorkerService } from '../worker/worker.service';
import { isoWeek } from '../personalization/personalization.service';

/** Pick copy by language without a translation framework. */
const t = (lang: Language, en: string, tw: string) => (lang === 'tw' ? tw : en);

/** Reply-id prefix for occupational-performance answers. */
export const FUNCTION_PREFIX = 'opf_';

/** The five activities, asked in this order. */
const STEPS = [
  'carrying',
  'arrangingStall',
  'standingSitting',
  'householdTasks',
  'ableToWork',
] as const;

type Step = (typeof STEPS)[number];

/**
 * Weekly occupational-performance check (spec §6).
 *
 * Five questions, each "how much trouble did this give you this week?", asked
 * straight after the weekly body-part check-in so the worker answers one short
 * series rather than two separate conversations.
 *
 * Deliberately about activities, not symptoms. "Can you still carry your goods"
 * tells an OT more than another pain number, and it is the question a market
 * woman can answer without translating her experience into a clinical scale.
 */
@Injectable()
export class FunctionCheckService {
  private readonly logger = new Logger(FunctionCheckService.name);

  constructor(
    @InjectRepository(FunctionScore) private readonly scores: Repository<FunctionScore>,
    private readonly workers: WorkerService,
  ) {}

  /** Does this reply belong to the occupational-performance flow? */
  owns(worker: Worker, replyId: string): boolean {
    return replyId.startsWith(FUNCTION_PREFIX) || worker.functionStep !== null;
  }

  /** Open this week's score set and ask the first question. */
  async begin(worker: Worker): Promise<WhatsAppOutbound[]> {
    await this.rowFor(worker.userId, isoWeek());
    worker.functionStep = STEPS[0];
    await this.workers.save(worker);
    return [
      {
        type: 'text',
        body: t(
          worker.language,
          'Two more quick ones about your week — not about pain this time, but about what you were able to do.',
          'Nsɛmmisa abien bio fa wo nnawɔtwe no ho — ɛnyɛ ɔyaw ho, na mmom deɛ wutumi yɛe.',
        ),
      },
      this.ask(STEPS[0], worker.language),
    ];
  }

  /**
   * Handle one answer. Returns an empty array when she is asking something
   * rather than answering, so the pipeline can route her to the agent.
   */
  async handle(worker: Worker, inbound: NormalizedInbound): Promise<WhatsAppOutbound[]> {
    const step = worker.functionStep as Step | null;
    if (!step) return this.begin(worker);

    const choice = (inbound.replyId ?? inbound.text ?? '').trim();
    if (!inbound.replyId && this.looksLikeQuestion(inbound.text ?? '')) {
      worker.functionStep = null;
      await this.workers.save(worker);
      return [];
    }

    const rating = this.parseRating(choice);
    if (rating === null) return [this.ask(step, worker.language)];

    const row = await this.rowFor(worker.userId, isoWeek());
    row[step] = rating;
    await this.scores.save(row);

    const next = STEPS[STEPS.indexOf(step) + 1];
    if (next) {
      worker.functionStep = next;
      await this.workers.save(worker);
      return [this.ask(next, worker.language)];
    }

    row.completedAt = new Date();
    await this.scores.save(row);
    worker.functionStep = null;
    await this.workers.save(worker);
    this.logger.log(`function check complete for ${worker.userId} (${row.week})`);

    return [{ type: 'text', body: this.closing(row, worker.language) }];
  }

  /** This week's row, created on first use. */
  private async rowFor(userId: string, week: string): Promise<FunctionScore> {
    const existing = await this.scores.findOne({ where: { userId, week } });
    if (existing) return existing;
    return this.scores.save(this.scores.create({ userId, week }));
  }

  /**
   * Reflect back what she reported. Naming the hardest activity is more useful
   * than a score she never asked for, and it sets up the next week's tips.
   */
  private closing(row: FunctionScore, lang: Language): string {
    const entries: [Step, number][] = STEPS.map((s) => [s, row[s] ?? 0]);
    const [worstStep, worstScore] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));

    if (worstScore === 0) {
      return t(
        lang,
        'Good — your work is not being held back this week. Keep protecting your body so it stays that way. 💚',
        'Ɛyɛ — w’adwuma nkɔ akyi nnawɔtwe yi. Kɔ so bɔ wo nipadua ho ban. 💚',
      );
    }

    return t(
      lang,
      `Thank you. ${this.activityName(worstStep, 'en')} is giving you the most trouble right now, so that's what I'll focus this week's tips on. 💚`,
      `Meda wo ase. ${this.activityName(worstStep, 'tw')} na ɛha wo paa seesei, enti ɛno so na mede nnawɔtwe yi afotu bɛgyina. 💚`,
    );
  }

  private activityName(step: Step, lang: Language): string {
    const names: Record<Step, [string, string]> = {
      carrying: ['Carrying your goods', 'Wo nneɛma soa'],
      arrangingStall: ['Arranging your stall', 'Wo dwa siesie'],
      standingSitting: ['Standing or sitting all day', 'Gyina anaa tena da mu nyinaa'],
      householdTasks: ['Work at home', 'Efie adwuma'],
      ableToWork: ['Being able to work', 'Adwuma yɛ tumi'],
    };
    return lang === 'tw' ? names[step][1] : names[step][0];
  }

  private ask(step: Step, lang: Language): WhatsAppOutbound {
    const prompts: Record<Step, [string, string]> = {
      carrying: [
        'This week, how much trouble did you have carrying or lifting your goods?',
        'Nnawɔtwe yi, wo nneɛma soa haw wo sɛn?',
      ],
      arrangingStall: [
        'How much trouble did you have setting up and arranging your stall?',
        'Wo dwa no siesie haw wo sɛn?',
      ],
      standingSitting: [
        'How much trouble did you have standing or sitting at your stall all day?',
        'Gyina anaa tena wo dwa so da mu nyinaa haw wo sɛn?',
      ],
      householdTasks: [
        'How much trouble did you have with work at home — cooking, cleaning, fetching water?',
        'Efie adwuma — aduannoa, ahosiesie, nsu kɔsa — haw wo sɛn?',
      ],
      ableToWork: [
        'And overall, how much did it affect your ability to keep working?',
        'Ne nyinaa mu, ɛsii wo kwan sɛ wobɛyɛ adwuma sɛn?',
      ],
    };

    return {
      type: 'list',
      body: lang === 'tw' ? prompts[step][1] : prompts[step][0],
      button: t(lang, 'Choose', 'Paw'),
      rows: [
        { id: `${FUNCTION_PREFIX}0`, title: t(lang, 'No trouble', 'Ɛnhaw me') },
        { id: `${FUNCTION_PREFIX}1`, title: t(lang, 'A little trouble', 'Ɛhaw me kakra') },
        { id: `${FUNCTION_PREFIX}2`, title: t(lang, 'A lot of trouble', 'Ɛhaw me dodo') },
        { id: `${FUNCTION_PREFIX}3`, title: t(lang, 'I could not do it', 'Mantumi anyɛ') },
      ],
    };
  }

  private parseRating(choice: string): FunctionRating | null {
    const c = choice.toLowerCase();
    const tapped = c.match(new RegExp(`^${FUNCTION_PREFIX}([0-3])$`));
    if (tapped) return Number(tapped[1]) as FunctionRating;
    if (/^(0|no trouble|enhaw)/.test(c)) return 0;
    if (/^(1|a little|kakra)/.test(c)) return 1;
    if (/^(2|a lot|dodo)/.test(c)) return 2;
    if (/^(3|could not|cannot|mantumi)/.test(c)) return 3;
    return null;
  }

  private looksLikeQuestion(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (/^[0-3]$/.test(trimmed)) return false;
    return trimmed.includes('?') || trimmed.length > 20;
  }
}
