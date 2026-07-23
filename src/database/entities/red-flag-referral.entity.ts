import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Every time the safety gate escalates. This is the safety-accountability
 * record (red_flags_referred in the dashboard schema) and, when a worker
 * replies CALL, the callback queue an OT reviews.
 */
@Entity('red_flag_referrals')
@Index(['userId', 'createdAt'])
export class RedFlagReferral {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  /** The rule(s) that fired, or "llm-backstop". */
  @Column({ type: 'varchar' })
  reason: string;

  /** The worker's original message that triggered escalation. */
  @Column({ type: 'text', nullable: true })
  triggerText: string | null;

  /** Worker asked for a callback (replied CALL). */
  @Column({ type: 'boolean', default: false })
  callbackRequested: boolean;

  @Column({ type: 'boolean', default: false })
  callbackResolved: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
