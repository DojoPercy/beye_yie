import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Worker } from '../../database/entities/worker.entity';

/** Get-or-create + update helpers for worker profiles. */
@Injectable()
export class WorkerService {
  constructor(
    @InjectRepository(Worker)
    private readonly workers: Repository<Worker>,
  ) {}

  async getOrCreate(userId: string, profileName?: string): Promise<Worker> {
    let worker = await this.workers.findOne({ where: { userId } });
    if (!worker) {
      worker = this.workers.create({
        userId,
        name: profileName ?? null,
        language: 'en',
        onboarded: false,
        onboardingStep: 'start',
        lastVerifiedInboundAt: new Date(),
      });
    } else {
      // This service is reached only after the webhook signature and business
      // phone-number checks in WhatsAppController have passed.
      worker.lastVerifiedInboundAt = new Date();
    }
    await this.workers.save(worker);
    return worker;
  }

  save(worker: Worker): Promise<Worker> {
    return this.workers.save(worker);
  }

  find(userId: string): Promise<Worker | null> {
    return this.workers.findOne({ where: { userId } });
  }

  all(): Promise<Worker[]> {
    return this.workers.find();
  }
}
