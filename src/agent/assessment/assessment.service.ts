import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import {
  Aggravator,
  Assessment,
  DurationBand,
  FunctionImpact,
  PriorTreatment,
} from '../../database/entities/assessment.entity';
import { Language, Worker } from '../../database/entities/worker.entity';
import { NormalizedInbound, WhatsAppOutbound } from '../../whatsapp/whatsapp.types';
import { WorkerService } from '../worker/worker.service';
import { EscalationService } from '../escalation/escalation.service';
import { parseNrsAnswer } from '../scoring/nrs';
import { RiskService } from './risk.service';

/** Pick copy by language without a translation framework. */
const t = (lang: Language, en: string, tw: string) => (lang === 'tw' ? tw : en);

/**
 * The initial OT assessment (spec §2), asked once after registration.
 *
 *   pain present? → body part → severity → duration → what makes it worse
 *                 → effect on work → what she has already tried → risk + advice
 *
 * Deterministic, like onboarding: every question is a tappable menu, no LLM is
 * involved, and answers are stored as they arrive so an interrupted assessment
 * resumes where it stopped.
 *
 * The red-flag gate runs before this service on every turn, so an urgent
 * symptom typed mid-assessment still escalates immediately.
 */
@Injectable()
export class AssessmentService {
  private readonly logger = new Logger(AssessmentService.name);

  constructor(
    @InjectRepository(Assessment) private readonly assessments: Repository<Assessment>,
    private readonly workers: WorkerService,
    private readonly risk: RiskService,
    private readonly escalation: EscalationService,
  ) {}

  /** True when this worker still owes us an initial assessment. */
  needsAssessment(worker: Worker): boolean {
    return worker.onboarded && !worker.assessmentCompletedAt;
  }

  /** Open the assessment and return its framing line plus the first question. */
  async begin(worker: Worker): Promise<WhatsAppOutbound[]> {
    await this.draftFor(worker.userId);
    worker.assessmentStep = 'pain_present';
    await this.workers.save(worker);

    const lang = worker.language;
    return [
      {
        type: 'text',
        body: t(
          lang,
          'Before we start, a few quick questions about your body so the tips fit you. Nothing here is a diagnosis — it just helps us know what to send, and when to suggest seeing someone.',
          'Ansa na yɛafi ase no, mebisa wo nsɛm kakra fa wo nipadua ho, na afotu no afata wo. Yei nyɛ ayaresa nhwehwɛmu — ɛboa yɛn ma yɛhu deɛ yɛmfa mmrɛ wo.',
        ),
      },
      this.askPainPresent(lang),
    ];
  }

  /** Handle one assessment turn. */
  async handle(worker: Worker, inbound: NormalizedInbound): Promise<WhatsAppOutbound[]> {
    const step = worker.assessmentStep;
    if (!step) return this.begin(worker);

    const choice = (inbound.replyId ?? inbound.text ?? '').trim();
    const draft = await this.draftFor(worker.userId);

    switch (step) {
      case 'pain_present': {
        const yes = this.parseYesNo(choice);
        if (yes === null) return [this.askPainPresent(worker.language)];
        draft.painPresent = yes;
        await this.assessments.save(draft);
        if (!yes) return this.complete(worker, draft);
        return this.advance(worker, 'body_part', this.askBodyPart(worker.language));
      }

      case 'body_part': {
        const part = this.parseBodyPart(choice);
        if (!part) return [this.askBodyPart(worker.language)];
        draft.bodyPart = part;
        await this.assessments.save(draft);
        return this.advance(worker, 'severity', this.askSeverity(worker.language));
      }

      case 'severity': {
        const nrs = this.parseSeverity(choice, inbound.text);
        if (nrs === null) return [this.askSeverity(worker.language)];
        draft.nrs = nrs;
        await this.assessments.save(draft);
        return this.advance(worker, 'duration', this.askDuration(worker.language));
      }

      case 'duration': {
        const band = this.parseDuration(choice);
        if (!band) return [this.askDuration(worker.language)];
        draft.durationBand = band;
        await this.assessments.save(draft);
        return this.advance(worker, 'aggravator', this.askAggravator(worker.language));
      }

      case 'aggravator': {
        const agg = this.parseAggravator(choice);
        if (!agg) return [this.askAggravator(worker.language)];
        draft.aggravator = agg;
        await this.assessments.save(draft);
        return this.advance(worker, 'function', this.askFunction(worker.language));
      }

      case 'function': {
        const impact = this.parseFunction(choice);
        if (!impact) return [this.askFunction(worker.language)];
        draft.functionImpact = impact;
        await this.assessments.save(draft);
        return this.advance(worker, 'prior_treatment', this.askPriorTreatment(worker.language));
      }

      case 'prior_treatment': {
        const prior = this.parsePriorTreatment(choice);
        if (!prior) return [this.askPriorTreatment(worker.language)];
        draft.priorTreatment = prior;
        await this.assessments.save(draft);
        return this.complete(worker, draft);
      }

      default:
        return this.complete(worker, draft);
    }
  }

  /** The most recent completed assessment, for summaries and trend baselines. */
  async latestCompleted(userId: string): Promise<Assessment | null> {
    return this.assessments.findOne({
      where: { userId, completedAt: Not(IsNull()) },
      order: { completedAt: 'DESC' },
    });
  }

  // ── Flow helpers ──

  private async advance(
    worker: Worker,
    step: string,
    question: WhatsAppOutbound,
  ): Promise<WhatsAppOutbound[]> {
    worker.assessmentStep = step;
    await this.workers.save(worker);
    return [question];
  }

  /** The open draft for this worker, created on first use. */
  private async draftFor(userId: string): Promise<Assessment> {
    const existing = await this.assessments.findOne({
      where: { userId, completedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    if (existing) return existing;
    return this.assessments.save(this.assessments.create({ userId }));
  }

  /** Score, store, advise, and refer when the grading warrants it. */
  private async complete(worker: Worker, draft: Assessment): Promise<WhatsAppOutbound[]> {
    const outcome = this.risk.score(draft, worker);
    draft.riskLevel = outcome.level;
    draft.riskReason = outcome.reasons.join('; ');
    draft.completedAt = new Date();
    await this.assessments.save(draft);

    worker.assessmentStep = null;
    worker.assessmentCompletedAt = draft.completedAt;
    await this.workers.save(worker);

    this.logger.log(`assessment complete for ${worker.userId}: risk=${outcome.level}`);

    const lang = worker.language;
    const messages: WhatsAppOutbound[] = [
      { type: 'text', body: this.adviceFor(outcome.level, lang) },
    ];

    // High risk is not an emergency — the gate handles those. It means she
    // should see someone soon, so give the real contact and offer a callback.
    if (outcome.level === 'high') {
      messages.push(
        ...(await this.escalation.referRoutine(
          worker.userId,
          'assessment',
          outcome.reasons.join('; '),
          lang,
        )),
      );
    }

    return messages;
  }

  private adviceFor(level: string, lang: Language): string {
    if (level === 'high') {
      return t(
        lang,
        "Thank you for answering. From what you've told me, this is worth having someone look at properly — it has gone on long enough, or affects your work enough, that self-care alone may not settle it. I'll keep sending tips in the meantime.",
        'Meda wo ase. Deɛ woaka no kyerɛ sɛ ɛsɛ sɛ obi hwɛ no yiye — abɔ bere tenten anaa ɛha w’adwuma dodo. Mɛkɔ so de afotu abrɛ wo saa bere no mu.',
      );
    }
    if (level === 'moderate') {
      return t(
        lang,
        "Thank you. Your body is telling you something, but there's a lot you can do yourself. I'll send tips made for the work you do, and check in with you each day. If it gets worse instead of better, tell me and I'll share who you can talk to.",
        'Meda wo ase. Wo nipadua reka biribi kyerɛ wo, nanso wubetumi ayɛ pii wɔ ho. Mɛfa afotu a ɛfata w’adwuma abrɛ wo, na mabisa wo asɛm da biara. Sɛ ɛkɔ so den a, ka kyerɛ me.',
      );
    }
    return t(
      lang,
      "Thank you. Nothing here worries me — that's good news. The best thing now is to protect your body before pain starts, and that's exactly what the daily tips are for.",
      'Meda wo ase. Biribiara nhaw me wɔ ha — ɛyɛ asɛmpa. Deɛ ɛyɛ papa seesei ne sɛ wobɛbɔ wo nipadua ho ban ansa na ɔyaw aba. Ɛno na afotu a yɛde bɛbrɛ wo da biara no yɛ.',
    );
  }

  // ── Questions ──

  private askPainPresent(lang: Language): WhatsAppOutbound {
    return {
      type: 'buttons',
      body: t(
        lang,
        'Do you have any pain or discomfort in your body right now?',
        'Wowɔ ɔyaw anaa ahokyere biara wɔ wo nipadua mu seesei?',
      ),
      buttons: [
        { id: 'asmt_pain_yes', title: t(lang, 'Yes', 'Aane') },
        { id: 'asmt_pain_no', title: t(lang, 'No', 'Dabi') },
      ],
    };
  }

  private askBodyPart(lang: Language): WhatsAppOutbound {
    return {
      type: 'list',
      body: t(lang, 'Where does it hurt most?', 'Ɛhe na ɛyɛ wo ya paa?'),
      button: t(lang, 'Choose', 'Paw'),
      rows: [
        { id: 'part_lower_back', title: t(lang, 'Lower back', 'Sisi'), description: t(lang, 'The waist area', 'Sisi hɔ') },
        { id: 'part_neck_shoulder', title: t(lang, 'Neck or shoulder', 'Kɔn anaa mmati'), description: t(lang, 'Top of the back too', 'Akyi soro nso') },
        { id: 'part_knees', title: t(lang, 'Knees', 'Nkotodwe'), description: t(lang, 'One or both knees', 'Baako anaa abien') },
        { id: 'part_legs_feet', title: t(lang, 'Legs or feet', 'Nan anaa nantin'), description: t(lang, 'Including swelling or aching', 'Ahonhon anaa ɔyaw') },
        { id: 'part_wrist_hand', title: t(lang, 'Wrist or hand', 'Nsa anaa nsateaa'), description: t(lang, 'Also fingers and thumb', 'Nsateaa nso') },
        { id: 'part_head', title: t(lang, 'Head', 'Ti'), description: t(lang, 'Headaches from carrying', 'Ti yaw a efi nnesoa') },
        { id: 'part_other', title: t(lang, 'Somewhere else', 'Baabi foforɔ'), description: t(lang, 'Not on this list', 'Ɛnni saa list yi so') },
      ],
    };
  }

  private askSeverity(lang: Language): WhatsAppOutbound {
    return {
      type: 'list',
      body: t(
        lang,
        'How bad is the pain, where 0 is none and 10 is the worst you can imagine? Tap a choice, or type a number 0–10.',
        'Ɔyaw no yɛ den sɛn? 0 kyerɛ sɛ biribiara nni hɔ, na 10 kyerɛ sɛ ɛyɛ den paa. Paw baako, anaa kyerɛw nɔmba 0–10.',
      ),
      button: t(lang, 'Choose', 'Paw'),
      rows: [
        { id: 'sev_0', title: t(lang, 'No pain (0)', 'Ɔyaw nni hɔ (0)') },
        { id: 'sev_2', title: t(lang, 'Mild (1–3)', 'Kakraa (1–3)') },
        { id: 'sev_5', title: t(lang, 'Moderate (4–6)', 'Ɛfa (4–6)') },
        { id: 'sev_8', title: t(lang, 'Severe (7–8)', 'Ɛyɛ den (7–8)') },
        { id: 'sev_10', title: t(lang, 'Worst possible (9–10)', 'Ɛyɛ den paa (9–10)') },
      ],
    };
  }

  private askDuration(lang: Language): WhatsAppOutbound {
    return {
      type: 'list',
      body: t(lang, 'How long have you had it?', 'Abɔ bere sɛn?'),
      button: t(lang, 'Choose', 'Paw'),
      rows: [
        { id: 'dur_days', title: t(lang, 'A few days', 'Nna kakra') },
        { id: 'dur_weeks_1_4', title: t(lang, '1 to 4 weeks', 'Nnawɔtwe 1–4') },
        { id: 'dur_months_1_3', title: t(lang, '1 to 3 months', 'Abosome 1–3') },
        { id: 'dur_months_3_plus', title: t(lang, 'More than 3 months', 'Abosome 3 boro') },
      ],
    };
  }

  private askAggravator(lang: Language): WhatsAppOutbound {
    return {
      type: 'list',
      body: t(lang, 'What makes it worse?', 'Dɛn na ɛma ɛyɛ den kɛse?'),
      button: t(lang, 'Choose', 'Paw'),
      rows: [
        { id: 'agg_lifting_carrying', title: t(lang, 'Lifting or carrying', 'Nnesoa') },
        { id: 'agg_bending_squatting', title: t(lang, 'Bending or squatting', 'Koto') },
        { id: 'agg_standing_long', title: t(lang, 'Standing a long time', 'Gyina bere tenten') },
        { id: 'agg_sitting_long', title: t(lang, 'Sitting a long time', 'Tena ase bere tenten') },
        { id: 'agg_hand_work', title: t(lang, 'Hand work', 'Nsa adwuma') },
        { id: 'agg_walking', title: t(lang, 'Walking', 'Nantew') },
        { id: 'agg_none', title: t(lang, 'Nothing particular', 'Biribiara pɔtee') },
      ],
    };
  }

  private askFunction(lang: Language): WhatsAppOutbound {
    return {
      type: 'list',
      body: t(
        lang,
        'How much does it affect your work and your daily activities?',
        'Ɛha w’adwuma ne wo daa nneyɛe sɛn?',
      ),
      button: t(lang, 'Choose', 'Paw'),
      rows: [
        { id: 'fn_none', title: t(lang, 'Not at all', 'Ɛnha me koraa') },
        { id: 'fn_a_little', title: t(lang, 'A little', 'Kakra') },
        { id: 'fn_a_lot', title: t(lang, 'A lot', 'Dodo') },
        { id: 'fn_cannot_work', title: t(lang, 'I cannot work', 'Mentumi nyɛ adwuma') },
      ],
    };
  }

  private askPriorTreatment(lang: Language): WhatsAppOutbound {
    return {
      type: 'list',
      body: t(lang, 'Have you tried anything for it already?', 'Woayɛ biribi ho bi dedaw?'),
      button: t(lang, 'Choose', 'Paw'),
      rows: [
        { id: 'pt_none', title: t(lang, 'Nothing yet', 'Menyɛɛ hwee') },
        { id: 'pt_chemist_medicine', title: t(lang, 'Medicine from a chemist', 'Aduru a mefi chemist') },
        { id: 'pt_massage_balm', title: t(lang, 'Massage or balm', 'Massage anaa balm') },
        { id: 'pt_clinic_hospital', title: t(lang, 'Been to a clinic', 'Makɔ ayaresabea') },
        { id: 'pt_traditional', title: t(lang, 'Traditional treatment', 'Amanne aduru') },
      ],
    };
  }

  // ── Parsers ──

  private parseYesNo(choice: string): boolean | null {
    const c = choice.toLowerCase();
    if (c === 'asmt_pain_yes' || /^(yes|aane|yea|y|1)$/.test(c)) return true;
    if (c === 'asmt_pain_no' || /^(no|dabi|n|2)$/.test(c)) return false;
    return null;
  }

  private parseBodyPart(choice: string): string | null {
    const c = choice.toLowerCase();
    if (c.startsWith('part_')) return c.slice('part_'.length);
    if (/back|sisi|waist/.test(c)) return 'lower_back';
    if (/neck|shoulder|kon|mmati/.test(c)) return 'neck_shoulder';
    if (/knee|kotodwe/.test(c)) return 'knees';
    if (/leg|feet|foot|nan|nantin/.test(c)) return 'legs_feet';
    if (/wrist|hand|finger|nsa/.test(c)) return 'wrist_hand';
    if (/head|ti\b/.test(c)) return 'head';
    return null;
  }

  /**
   * Severity from either a tapped band (stored as its midpoint) or a number
   * the worker typed, which is kept exactly as given.
   */
  private parseSeverity(choice: string, rawText: string): number | null {
    const c = choice.toLowerCase();
    const band = c.match(/^sev_(\d{1,2})$/);
    if (band) return Number(band[1]);
    return parseNrsAnswer(rawText || choice);
  }

  private parseDuration(choice: string): DurationBand | null {
    const c = choice.toLowerCase();
    if (c === 'dur_days' || /\bday/.test(c)) return 'days';
    if (c === 'dur_weeks_1_4' || /week|nnawotwe/.test(c)) return 'weeks_1_4';
    if (c === 'dur_months_3_plus' || /more than 3|3 boro|boro/.test(c)) return 'months_3_plus';
    if (c === 'dur_months_1_3' || /month|abosome/.test(c)) return 'months_1_3';
    return null;
  }

  private parseAggravator(choice: string): Aggravator | null {
    const c = choice.toLowerCase();
    if (c.startsWith('agg_')) return c.slice('agg_'.length) as Aggravator;
    if (/lift|carry|nnesoa/.test(c)) return 'lifting_carrying';
    if (/bend|squat|koto/.test(c)) return 'bending_squatting';
    if (/stand|gyina/.test(c)) return 'standing_long';
    if (/sit|tena/.test(c)) return 'sitting_long';
    if (/hand|nsa/.test(c)) return 'hand_work';
    if (/walk|nantew/.test(c)) return 'walking';
    if (/nothing|none|biribiara/.test(c)) return 'none';
    return null;
  }

  private parseFunction(choice: string): FunctionImpact | null {
    const c = choice.toLowerCase();
    if (c.startsWith('fn_')) return c.slice('fn_'.length) as FunctionImpact;
    if (/cannot work|can'?t work|mentumi/.test(c)) return 'cannot_work';
    if (/a lot|dodo/.test(c)) return 'a_lot';
    if (/little|kakra/.test(c)) return 'a_little';
    if (/not at all|none|ɛnha|enha/.test(c)) return 'none';
    return null;
  }

  private parsePriorTreatment(choice: string): PriorTreatment | null {
    const c = choice.toLowerCase();
    if (c.startsWith('pt_')) return c.slice('pt_'.length) as PriorTreatment;
    if (/nothing|none|menye/.test(c)) return 'none';
    if (/chemist|medicine|aduru/.test(c)) return 'chemist_medicine';
    if (/massage|balm/.test(c)) return 'massage_balm';
    if (/clinic|hospital|ayaresabea/.test(c)) return 'clinic_hospital';
    if (/tradition|amanne/.test(c)) return 'traditional';
    return null;
  }
}
