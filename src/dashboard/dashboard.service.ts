import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Worker } from '../database/entities/worker.entity';
import { PainEvent } from '../database/entities/pain-event.entity';
import { CheckIn } from '../database/entities/check-in.entity';
import { RedFlagReferral } from '../database/entities/red-flag-referral.entity';
import { TipDelivery } from '../database/entities/tip-delivery.entity';

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
