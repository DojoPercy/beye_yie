import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CheckIn, CheckInValue } from '../../database/entities/check-in.entity';
import { PainEvent } from '../../database/entities/pain-event.entity';
import { TipDelivery } from '../../database/entities/tip-delivery.entity';
import { Category, Worker } from '../../database/entities/worker.entity';
import { Tip } from '../../database/entities/tip.entity';

/**
 * Phase-2 personalization: pain-history recall, adaptive tip selection (don't
 * repeat what was recently sent; surface tips for recurring pain), and a
 * gentle streak/encouragement feel. All derived from the event log.
 */
@Injectable()
export class PersonalizationService {
  constructor(
    @InjectRepository(PainEvent) private readonly pains: Repository<PainEvent>,
    @InjectRepository(CheckIn) private readonly checkIns: Repository<CheckIn>,
    @InjectRepository(TipDelivery) private readonly deliveries: Repository<TipDelivery>,
    @InjectRepository(Tip) private readonly tips: Repository<Tip>,
  ) {}

  /** Record a parsed pain report. */
  async recordPain(
    userId: string,
    bodyPart: string,
    category: Category | null,
    matchedTipId: string | null,
    severityNrs: number | null,
  ): Promise<void> {
    await this.pains.save(
      this.pains.create({ userId, bodyPart, category, matchedTipId, severityNrs }),
    );
  }

  /** Record a weekly check-in reply. */
  async recordCheckIn(userId: string, bodyPart: string, value: CheckInValue): Promise<void> {
    await this.checkIns.save(this.checkIns.create({ userId, bodyPart, value, week: isoWeek() }));
  }

  /**
   * A short, human context line for greetings, e.g.
   * "Last week your wrist was sore — better this week?" Returns '' if nothing
   * worth recalling.
   */
  async recallLine(userId: string, language: 'tw' | 'en'): Promise<string> {
    const lastPain = await this.pains.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    if (!lastPain) return '';
    const days = Math.floor((Date.now() - lastPain.createdAt.getTime()) / 86_400_000);
    if (days > 21) return '';
    return language === 'tw'
      ? `Nnansa ni na wo ${lastPain.bodyPart} yɛɛ ya — ɛte sɛn afei?`
      : `Last time your ${lastPain.bodyPart} was sore — how is it now?`;
  }

  /**
   * Pick the next daily tip for a worker: rotate through their category's tips,
   * skipping the most recently delivered ones, and biasing toward body parts
   * they've reported pain in.
   */
  async pickDailyTip(worker: Worker): Promise<Tip | null> {
    const category = (worker.category ?? 'load') as Category;
    const catTips = await this.tips.find({ where: { category }, order: { seq: 'ASC' } });
    if (catTips.length === 0) return null;

    const recent = await this.deliveries.find({
      where: { userId: worker.userId },
      order: { sentAt: 'DESC' },
      take: catTips.length - 1,
    });
    const recentIds = new Set(recent.map((r) => r.tipId));

    // Prefer a tip matching a recurring pain that wasn't just sent.
    const recurringTipId = await this.recurringTipId(worker.userId);
    if (recurringTipId && !recentIds.has(recurringTipId)) {
      const t = catTips.find((x) => x.id === recurringTipId);
      if (t) return t;
    }

    const fresh = catTips.find((t) => !recentIds.has(t.id));
    return fresh ?? catTips[worker.tipCursor % catTips.length];
  }

  /** Log that a tip was delivered (engagement metric). */
  async logDelivery(userId: string, tipId: string): Promise<void> {
    await this.deliveries.save(this.deliveries.create({ userId, tipId }));
  }

  /** Consecutive-day streak of tip deliveries — the "10 days strong" feel. */
  async streakDays(userId: string): Promise<number> {
    const rows = await this.deliveries.find({
      where: { userId },
      order: { sentAt: 'DESC' },
      take: 60,
    });
    const days = new Set(rows.map((r) => r.sentAt.toISOString().slice(0, 10)));
    let streak = 0;
    const cursor = new Date();
    // Count back from today while each day has a delivery.
    // Allow "today not yet sent" by also checking from yesterday.
    for (let i = 0; i < 60; i++) {
      const key = cursor.toISOString().slice(0, 10);
      if (days.has(key)) {
        streak++;
      } else if (i > 0) {
        break;
      }
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  private async recurringTipId(userId: string): Promise<string | null> {
    const rows = await this.pains
      .createQueryBuilder('p')
      .select('p.matchedTipId', 'tipId')
      .addSelect('COUNT(*)', 'n')
      .where('p.userId = :userId AND p.matchedTipId IS NOT NULL', { userId })
      .groupBy('p.matchedTipId')
      .orderBy('n', 'DESC')
      .limit(1)
      .getRawOne<{ tipId: string; n: string }>();
    return rows?.tipId ?? null;
  }
}

/** ISO week key like 2026-W30. */
export function isoWeek(d = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
