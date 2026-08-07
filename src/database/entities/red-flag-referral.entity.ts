import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Why a worker was pointed at a professional.
 * - `red_flag`   — the safety gate fired on an urgent symptom.
 * - `assessment` — the initial assessment graded her high risk.
 * - `trend`      — her tracked symptoms are worsening over time.
 *
 * Kept apart so the urgent-escalation count stays a true safety metric rather
 * than a mix of emergencies and routine advice to see someone.
 */
export type ReferralKind = 'red_flag' | 'assessment' | 'trend';

/**
 * Every time the bot hands a worker off to a human. This is the safety-
 * accountability record (red_flags_referred in the dashboard schema) and, when
 * a worker replies CALL, the callback queue an OT reviews.
 */
@Entity('red_flag_referrals')
@Index(['userId', 'createdAt'])
export class RedFlagReferral {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar', length: 16, default: 'red_flag' })
  kind: ReferralKind;

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
