import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Idempotency ledger. Meta retries a webhook whenever our ack is slow, which
 * would otherwise reprocess the same message — causing duplicate, delayed, and
 * (under concurrency) truncated replies. We record every handled Meta message
 * id and skip any we've already seen.
 */
@Entity('processed_messages')
export class ProcessedMessage {
  @PrimaryColumn({ type: 'varchar' })
  messageId: string;

  @CreateDateColumn()
  createdAt: Date;
}
