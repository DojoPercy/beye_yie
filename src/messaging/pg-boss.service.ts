import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBoss } from 'pg-boss';

/**
 * Thin wrapper around pg-boss (Postgres-backed job queue). Gives the inbound
 * WhatsApp pipeline durability + idempotency without a separate broker —
 * the same pattern washam-ai uses.
 */
@Injectable()
export class PgBossService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PgBossService.name);
  private boss: PgBoss;
  private started = false;

  constructor(private readonly config: ConfigService) {
    this.boss = new PgBoss({
      connectionString:
        this.config.get<string>('databaseUrl') ??
        'postgresql://postgres:postgres@localhost:5432/beye_yie',
    });
  }

  async onModuleInit(): Promise<void> {
    this.boss.on('error', (err) => this.logger.error('pg-boss error', err));
    await this.boss.start();
    this.started = true;
    this.logger.log('pg-boss started');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.started) await this.boss.stop({ graceful: true });
  }

  async send<T extends object>(queue: string, data: T): Promise<void> {
    await this.boss.createQueue(queue).catch(() => undefined);
    await this.boss.send(queue, data);
  }

  async work<T extends object>(
    queue: string,
    handler: (data: T) => Promise<void>,
    concurrency = 5,
  ): Promise<void> {
    await this.boss.createQueue(queue).catch(() => undefined);
    await this.boss.work<T>(
      queue,
      { batchSize: concurrency },
      async (jobs) => {
        for (const job of jobs) {
          await handler(job.data);
        }
      },
    );
    this.logger.log(`worker registered on "${queue}" (concurrency ${concurrency})`);
  }
}
