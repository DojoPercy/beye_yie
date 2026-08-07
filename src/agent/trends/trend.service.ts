import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { CheckIn } from '../../database/entities/check-in.entity';
import { DailyCheckIn } from '../../database/entities/daily-check-in.entity';
import { RedFlagReferral } from '../../database/entities/red-flag-referral.entity';

export type TrendDirection = 'improving' | 'stable' | 'worsening' | 'unknown';

export interface TrendSummary {
  /** Window the summary covers, in days. */
  days: number;
  /** Check-ins with at least a pain answer. */
  checkInsAnswered: number;
  averageNrs: number | null;
  /** Mean over the most recent half of the window. */
  recentAverageNrs: number | null;
  /** Mean over the earlier half, for comparison. */
  priorAverageNrs: number | null;
  direction: TrendDirection;
  latestNrs: number | null;
  /** Consecutive most-recent days at or above the high-pain threshold. */
  highPainStreak: number;
  daysWorked: number;
  heavyLiftDays: number;
  exerciseDays: number;
  /** Share of answered check-ins where she did her stretches, 0–1. */
  adherenceRate: number | null;
}

export interface TrendAlert {
  refer: boolean;
  reasons: string[];
}

/**
 * Progress tracking (spec §4): turns the daily check-in series into a trend,
 * an adherence figure, and a decision about whether symptoms are heading the
 * wrong way.
 *
 * Recording data is not monitoring. This is the piece that makes a run of
 * worsening days actually do something instead of sitting in a table.
 *
 * ⚠️ OT SIGN-OFF PENDING — the thresholds below decide when a worker is told
 * to see someone. They are gathered as named constants for exactly that
 * review.
 */
@Injectable()
export class TrendService {
  /** A rise of this many NRS points between halves of the window is worsening. */
  private static readonly WORSENING_DELTA = 2;
  /** The same fall counts as improving. */
  private static readonly IMPROVING_DELTA = 2;
  /** Pain at or above this is "high" for streak purposes. */
  private static readonly HIGH_PAIN_NRS = 7;
  /** Consecutive high-pain days that warrant a referral. */
  private static readonly HIGH_PAIN_STREAK_DAYS = 3;
  /** Consecutive weekly "worse" replies that warrant a referral. */
  private static readonly WORSE_WEEKS = 3;
  /** Don't re-refer for a trend within this many days. */
  private static readonly REFERRAL_COOLDOWN_DAYS = 14;
  /** Minimum answered check-ins before a trend means anything. */
  private static readonly MIN_POINTS = 4;

  constructor(
    @InjectRepository(DailyCheckIn) private readonly daily: Repository<DailyCheckIn>,
    @InjectRepository(CheckIn) private readonly weekly: Repository<CheckIn>,
    @InjectRepository(RedFlagReferral) private readonly referrals: Repository<RedFlagReferral>,
  ) {}

  /** Aggregate the last `days` of daily check-ins. */
  async summarize(userId: string, days = 14): Promise<TrendSummary> {
    const since = dayKey(new Date(Date.now() - days * 86_400_000));
    const rows = await this.daily.find({
      where: { userId, day: MoreThanOrEqual(since) },
      order: { day: 'ASC' },
    });

    const scored = rows.filter((r) => r.nrs !== null && r.nrs !== undefined);
    const half = Math.floor(scored.length / 2);
    const prior = scored.slice(0, half);
    const recent = scored.slice(half);

    const recentAverageNrs = mean(recent.map((r) => r.nrs as number));
    const priorAverageNrs = mean(prior.map((r) => r.nrs as number));

    const answered = rows.filter((r) => r.didExercises !== null && r.didExercises !== undefined);
    const exerciseDays = answered.filter((r) => r.didExercises).length;

    return {
      days,
      checkInsAnswered: scored.length,
      averageNrs: mean(scored.map((r) => r.nrs as number)),
      recentAverageNrs,
      priorAverageNrs,
      direction: this.direction(scored.length, recentAverageNrs, priorAverageNrs),
      latestNrs: scored.length ? (scored[scored.length - 1].nrs as number) : null,
      highPainStreak: this.highPainStreak(scored),
      daysWorked: rows.filter((r) => r.worked === true).length,
      heavyLiftDays: rows.filter((r) => r.liftedHeavy === true).length,
      exerciseDays,
      adherenceRate: answered.length ? exerciseDays / answered.length : null,
    };
  }

  /**
   * Should this worker be pointed at a professional because of how her
   * symptoms are moving? Emergencies are not this service's job — the
   * red-flag gate handles those in real time.
   */
  async detectAlert(userId: string): Promise<TrendAlert> {
    const reasons: string[] = [];
    const summary = await this.summarize(userId, 14);

    if (summary.checkInsAnswered >= TrendService.MIN_POINTS && summary.direction === 'worsening') {
      reasons.push(
        `Pain rising over 2 weeks (${fmt(summary.priorAverageNrs)} → ${fmt(summary.recentAverageNrs)})`,
      );
    }

    if (summary.highPainStreak >= TrendService.HIGH_PAIN_STREAK_DAYS) {
      reasons.push(`Pain at ${TrendService.HIGH_PAIN_NRS}+ for ${summary.highPainStreak} days running`);
    }

    const worseWeeks = await this.consecutiveWorseWeeks(userId);
    if (worseWeeks >= TrendService.WORSE_WEEKS) {
      reasons.push(`Reported "worse" ${worseWeeks} weekly check-ins in a row`);
    }

    if (reasons.length === 0) return { refer: false, reasons };

    // One referral per fortnight: repeating it every evening would train her
    // to ignore the message that matters.
    const recentlyReferred = await this.referredRecently(userId);
    return { refer: !recentlyReferred, reasons };
  }

  private direction(
    points: number,
    recent: number | null,
    prior: number | null,
  ): TrendDirection {
    if (points < TrendService.MIN_POINTS || recent === null || prior === null) return 'unknown';
    const delta = recent - prior;
    if (delta >= TrendService.WORSENING_DELTA) return 'worsening';
    if (delta <= -TrendService.IMPROVING_DELTA) return 'improving';
    return 'stable';
  }

  /** Consecutive most-recent days at or above the high-pain threshold. */
  private highPainStreak(scored: DailyCheckIn[]): number {
    let streak = 0;
    for (let i = scored.length - 1; i >= 0; i--) {
      if ((scored[i].nrs as number) >= TrendService.HIGH_PAIN_NRS) streak++;
      else break;
    }
    return streak;
  }

  private async consecutiveWorseWeeks(userId: string): Promise<number> {
    const rows = await this.weekly.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 8,
    });
    let streak = 0;
    for (const row of rows) {
      if (row.value === 'worse') streak++;
      else break;
    }
    return streak;
  }

  private async referredRecently(userId: string): Promise<boolean> {
    const since = new Date(Date.now() - TrendService.REFERRAL_COOLDOWN_DAYS * 86_400_000);
    const count = await this.referrals.count({
      where: { userId, kind: 'trend', createdAt: MoreThanOrEqual(since) },
    });
    return count > 0;
  }
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1));
}

function fmt(value: number | null): string {
  return value === null ? '—' : value.toFixed(1);
}

/** Accra calendar day, YYYY-MM-DD. */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
