import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * One day's check-in (spec §3): pain level, whether she worked, whether she
 * carried heavy loads, and whether she did her stretches.
 *
 * Separate from the weekly {@link CheckIn}, which asks a single "how is your
 * back this week" question. This is the daily series that {@link TrendService}
 * reads to detect worsening and measure exercise adherence — the two things
 * the weekly one-question format cannot show.
 *
 * Fields stay nullable: a worker who answers the first question and stops
 * still contributes a usable pain point for the trend.
 */
@Entity('daily_check_ins')
@Unique('UQ_daily_check_in_user_day', ['userId', 'day'])
@Index(['userId', 'day'])
export class DailyCheckIn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  /** Accra calendar day, YYYY-MM-DD. One check-in per worker per day. */
  @Column({ type: 'varchar', length: 10 })
  day: string;

  /** Today's pain, 0–10. */
  @Column({ type: 'int', nullable: true })
  nrs: number | null;

  @Column({ type: 'boolean', nullable: true })
  worked: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  liftedHeavy: boolean | null;

  /** Adherence — did she do the recommended stretches or exercises? */
  @Column({ type: 'boolean', nullable: true })
  didExercises: boolean | null;

  /** Null while the day's questions are still being answered. */
  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
