import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { Worker } from '../database/entities/worker.entity';
import { PainEvent } from '../database/entities/pain-event.entity';
import { CheckIn } from '../database/entities/check-in.entity';
import { RedFlagReferral } from '../database/entities/red-flag-referral.entity';
import { TipDelivery } from '../database/entities/tip-delivery.entity';
import { Assessment } from '../database/entities/assessment.entity';
import { DailyCheckIn } from '../database/entities/daily-check-in.entity';
import { FunctionScore } from '../database/entities/function-score.entity';
import { RiskService } from '../agent/assessment/risk.service';

/**
 * How urgently a human should make contact.
 * - `urgent` — reach out today.
 * - `high`   — reach out this week.
 * - `watch`  — keep an eye on; no action required yet.
 */
export type OutreachPriority = 'urgent' | 'high' | 'watch';

export interface OutreachRow {
  userId: string;
  name: string | null;
  /**
   * False when there is no worker row at all. The safety gate escalates on the
   * first message, so a woman can be flagged before she ever registers — she
   * still needs the call.
   */
  hasProfile: boolean;
  priority: OutreachPriority;
  /** Plain-language justifications, most severe first. For the OT, not the worker. */
  reasons: string[];
  /** Most recent pain score from any source, 0-10. */
  latestNrs: number | null;
  bodyPart: string | null;
  /** She replied CALL — an explicit request, not our inference. */
  askedForCall: boolean;
  /** Her own words that triggered the escalation, when there was one. */
  triggerText: string | null;
  lastContactAt: Date | null;
  daysSinceContact: number | null;
  /** When the oldest still-open signal was raised. */
  flaggedAt: Date;
}

const RANK: Record<OutreachPriority, number> = { urgent: 3, high: 2, watch: 1 };

/** Only look this far back — an eight-week-old pain score is not a to-do. */
const WINDOW_DAYS = 30;
/** An onboarded worker silent this long has effectively dropped out. */
const QUIET_DAYS = 14;
/** Grace period before an unfinished registration counts as stalled. */
const STALLED_ONBOARDING_DAYS = 3;
/** Difficulty rating (0-3) at which "can she keep working" is a real problem. */
const CANNOT_WORK = 3;
const STRUGGLING_TO_WORK = 2;

/**
 * GHS impact dashboard queries. Same event log that powers personalization,
 * read as aggregate reporting views — the dashboard is a projection, not a
 * second data pipeline (architecture plan §05).
 */
@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Worker) private readonly workers: Repository<Worker>,
    @InjectRepository(PainEvent) private readonly pains: Repository<PainEvent>,
    @InjectRepository(CheckIn) private readonly checkIns: Repository<CheckIn>,
    @InjectRepository(RedFlagReferral) private readonly referrals: Repository<RedFlagReferral>,
    @InjectRepository(TipDelivery) private readonly deliveries: Repository<TipDelivery>,
    @InjectRepository(Assessment) private readonly assessments: Repository<Assessment>,
    @InjectRepository(DailyCheckIn) private readonly dailyCheckIns: Repository<DailyCheckIn>,
    @InjectRepository(FunctionScore) private readonly functionScores: Repository<FunctionScore>,
  ) {}

  async summary() {
    const [totalWorkers, onboarded] = await Promise.all([
      this.workers.count(),
      this.workers.count({ where: { onboarded: true } }),
    ]);

    const byCategory = await this.groupCount(this.workers, 'category');
    const byLanguage = await this.groupCount(this.workers, 'language');

    const tipsSent = await this.deliveries.count();
    const tipsOpened = await this.deliveries
      .createQueryBuilder('d')
      .where('d.openedAt IS NOT NULL')
      .getCount();

    const painByBodyPart = await this.pains
      .createQueryBuilder('p')
      .select('p.bodyPart', 'bodyPart')
      .addSelect('COUNT(*)', 'count')
      .groupBy('p.bodyPart')
      .orderBy('count', 'DESC')
      .getRawMany();

    const checkInTrend = await this.checkIns
      .createQueryBuilder('c')
      .select('c.value', 'value')
      .addSelect('COUNT(*)', 'count')
      .groupBy('c.value')
      .getRawMany();

    const redFlagsReferred = await this.referrals.count();
    const callbacksRequested = await this.referrals.count({ where: { callbackRequested: true } });

    return {
      reach: {
        totalWorkers,
        onboarded,
        byCategory,
        byLanguage,
      },
      engagement: {
        tipsSent,
        tipsOpened,
        openRate: tipsSent ? Number((tipsOpened / tipsSent).toFixed(2)) : 0,
      },
      health: {
        painByBodyPart: painByBodyPart.map((r) => ({ bodyPart: r.bodyPart, count: Number(r.count) })),
        checkInTrend: checkInTrend.map((r) => ({ value: r.value, count: Number(r.count) })),
      },
      safety: {
        redFlagsReferred,
        callbacksRequested,
      },
    };
  }

  /** Pending callbacks an OT needs to action. */
  async callbacks() {
    return this.referrals.find({
      where: { callbackRequested: true, callbackResolved: false },
      order: { createdAt: 'DESC' },
    });
  }


  /**
   * Who a human should contact, and why — the working end of the dashboard.
   *
   * The callback queue only shows women who replied CALL. Most never do: they
   * are told to see someone and then go quiet, which is exactly the group that
   * needs chasing. This widens the net to every open distress signal in the
   * event log and ranks it, so an OT with one afternoon knows where to start.
   *
   * Thresholds are the same ones the agent grades on ({@link RiskService}),
   * so this view can never disagree with what the worker was told.
   *
   * ⚠️ Triage aid, not a diagnosis — the same caveat that governs RiskService.
   */
  async outreach(): Promise<OutreachRow[]> {
    const now = Date.now();
    const since = new Date(now - WINDOW_DAYS * 86_400_000);
    const sinceDay = since.toISOString().slice(0, 10);

    const [workers, referrals, dailies, weeklies, functions, assessments, pains] = await Promise.all([
      this.workers.find(),
      this.referrals.find({ order: { createdAt: 'DESC' } }),
      this.dailyCheckIns.find({ where: { day: MoreThanOrEqual(sinceDay) }, order: { day: 'DESC' } }),
      this.checkIns.find({ where: { createdAt: MoreThanOrEqual(since) }, order: { createdAt: 'DESC' } }),
      this.functionScores.find({ where: { createdAt: MoreThanOrEqual(since) }, order: { createdAt: 'DESC' } }),
      this.assessments.find({ order: { createdAt: 'DESC' } }),
      this.pains.find({ where: { createdAt: MoreThanOrEqual(since) }, order: { createdAt: 'DESC' } }),
    ]);

    // Rows arrive newest-first, so the first hit per worker is the latest one.
    const latestBy = <T extends { userId: string }>(rows: T[]): Map<string, T> => {
      const map = new Map<string, T>();
      for (const row of rows) if (!map.has(row.userId)) map.set(row.userId, row);
      return map;
    };

    const lastDaily = latestBy(dailies.filter((d) => d.nrs !== null));
    const lastWeekly = latestBy(weeklies);
    const lastFunction = latestBy(functions);
    const lastAssessment = latestBy(assessments.filter((a) => a.completedAt !== null));
    const lastPain = latestBy(pains);
    const openCallbacks = latestBy(referrals.filter((r) => r.callbackRequested && !r.callbackResolved));
    const unactioned = latestBy(
      referrals.filter((r) => !r.callbackRequested && !r.callbackResolved && r.createdAt >= since),
    );

    // Union, not just the workers table: escalation records only carry a
    // userId, so a red flag raised before sign-up has no worker row behind it.
    const workerById = new Map(workers.map((w) => [w.userId, w]));
    const candidates = new Set<string>([
      ...workerById.keys(),
      ...openCallbacks.keys(),
      ...unactioned.keys(),
      ...lastDaily.keys(),
      ...lastPain.keys(),
      ...lastFunction.keys(),
      ...lastWeekly.keys(),
      ...lastAssessment.keys(),
    ]);

    const rows: OutreachRow[] = [];

    for (const userId of candidates) {
      const worker = workerById.get(userId);
      const reasons: { priority: OutreachPriority; text: string }[] = [];
      const dates: Date[] = [];
      const add = (priority: OutreachPriority, text: string, at?: Date | null) => {
        reasons.push({ priority, text });
        if (at) dates.push(at);
      };

      const callback = openCallbacks.get(userId);
      if (callback) add('urgent', 'Asked for a callback and has not had one', callback.createdAt);

      const daily = lastDaily.get(userId);
      if (daily?.nrs != null) {
        if (daily.nrs >= RiskService.HIGH_NRS) add('urgent', `Pain ${daily.nrs}/10 at her last check-in`, daily.createdAt);
        else if (daily.nrs >= RiskService.MODERATE_NRS) add('high', `Pain ${daily.nrs}/10 at her last check-in`, daily.createdAt);
      }

      const pain = lastPain.get(userId);
      if (pain?.severityNrs != null && pain.severityNrs >= RiskService.HIGH_NRS) {
        add('urgent', `Reported ${pain.bodyPart} pain at ${pain.severityNrs}/10`, pain.createdAt);
      }

      const fn = lastFunction.get(userId);
      if (fn?.ableToWork != null) {
        if (fn.ableToWork >= CANNOT_WORK) add('urgent', 'Cannot keep working at all', fn.createdAt);
        else if (fn.ableToWork >= STRUGGLING_TO_WORK) add('high', 'Struggling to keep trading', fn.createdAt);
      }

      const assessment = lastAssessment.get(userId);
      if (assessment) {
        if (assessment.functionImpact === 'cannot_work') add('urgent', 'Assessment: unable to work', assessment.completedAt);
        else if (assessment.riskLevel === 'high') add('high', 'Graded high risk at assessment', assessment.completedAt);
        else if (assessment.riskLevel === 'moderate') add('watch', 'Graded moderate risk at assessment', assessment.completedAt);
      }

      // Escalated by the bot, never asked for the call — the silent group.
      const missed = unactioned.get(userId);
      if (missed && !callback) {
        add('high', `Told to see someone (${missed.reason}) but did not ask for a call`, missed.createdAt);
      }

      const weekly = lastWeekly.get(userId);
      if (weekly?.value === 'worse') add('high', `Says her ${weekly.bodyPart} is worse this week`, weekly.createdAt);

      const lastContactAt = worker?.lastVerifiedInboundAt ?? null;
      const daysSinceContact = lastContactAt
        ? Math.floor((now - new Date(lastContactAt).getTime()) / 86_400_000)
        : null;

      if (!worker) {
        // The missing profile is context for whoever makes the call, never a
        // reason to call: it only rides along once a real signal has fired.
        if (reasons.length) add('watch', 'No profile on record — flagged before she finished signing up');
      } else if (worker.onboarded) {
        if (daysSinceContact !== null && daysSinceContact >= QUIET_DAYS) {
          add('watch', `Silent for ${daysSinceContact} days`, lastContactAt);
        }
      } else {
        const age = Math.floor((now - new Date(worker.signupDate).getTime()) / 86_400_000);
        if (age >= STALLED_ONBOARDING_DAYS) add('watch', `Never finished registering (${age} days ago)`, worker.signupDate);
      }

      if (!reasons.length) continue;

      reasons.sort((a, b) => RANK[b.priority] - RANK[a.priority]);
      rows.push({
        userId,
        name: worker?.name ?? null,
        hasProfile: Boolean(worker),
        priority: reasons[0].priority,
        reasons: reasons.map((r) => r.text),
        latestNrs: daily?.nrs ?? pain?.severityNrs ?? assessment?.nrs ?? null,
        bodyPart: pain?.bodyPart ?? assessment?.bodyPart ?? weekly?.bodyPart ?? null,
        askedForCall: Boolean(callback),
        triggerText: callback?.triggerText ?? missed?.triggerText ?? null,
        lastContactAt,
        daysSinceContact,
        flaggedAt: dates.length
          ? new Date(Math.min(...dates.map((d) => new Date(d).getTime())))
          : (worker?.signupDate ?? new Date(now)),
      });
    }

    // Most urgent first; within a band, whoever has been waiting longest.
    return rows.sort(
      (a, b) => RANK[b.priority] - RANK[a.priority] || a.flaggedAt.getTime() - b.flaggedAt.getTime(),
    );
  }

  private async groupCount<T extends object>(
    repo: Repository<T>,
    column: string,
  ): Promise<Record<string, number>> {
    const rows = await repo
      .createQueryBuilder('t')
      .select(`t.${column}`, 'key')
      .addSelect('COUNT(*)', 'count')
      .groupBy(`t.${column}`)
      .getRawMany();
    return rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.key ?? 'unknown'] = Number(r.count);
      return acc;
    }, {});
  }
}
