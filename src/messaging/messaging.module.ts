import { Global, Module } from '@nestjs/common';
import { PgBossService } from './pg-boss.service';

/** Queues are used across whatsapp + agent, so expose globally. */
@Global()
@Module({
  providers: [PgBossService],
  exports: [PgBossService],
})
export class MessagingModule {}
