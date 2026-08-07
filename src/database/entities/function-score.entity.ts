import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * Difficulty doing one activity: 0 no trouble → 3 cannot do it at all.
 * Higher is worse, so the five scores sum into a single difficulty total.
 */
export type FunctionRating = 0 | 1 | 2 | 3;

/**
 * Weekly occupational-performance scores (spec §6).
 *
 * This is the measure that keeps the project occupational therapy rather than
 * generic pain tracking: it asks what her body stops her *doing*, in the terms
 * of her actual work — carrying goods, arranging the stall, standing all day,
 * housework, and whether she can keep trading at all.
 *
 * Pain scores can stay flat while function quietly collapses, which is why
 * this is tracked separately from {@link DailyCheckIn}.
 */
@Entity('function_scores')
@Unique('UQ_function_score_user_week', ['userId', 'week'])
@Index(['userId', 'week'])
export class FunctionScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  /** ISO week key, e.g. 2026-W30. One score set per worker per week. */
  @Column({ type: 'varchar', length: 8 })
  week: string;

  /** Carrying or lifting goods. */
  @Column({ type: 'int', nullable: true })
  carrying: FunctionRating | null;

  /** Setting up, arranging and packing down the stall. */
  @Column({ type: 'int', nullable: true })
  arrangingStall: FunctionRating | null;

  /** Standing or sitting at the stall for long stretches. */
  @Column({ type: 'int', nullable: true })
  standingSitting: FunctionRating | null;

  /** Cooking, cleaning, fetching water and other work at home. */
  @Column({ type: 'int', nullable: true })
  householdTasks: FunctionRating | null;

  /** Being able to keep working at all — the outcome that matters most. */
  @Column({ type: 'int', nullable: true })
  ableToWork: FunctionRating | null;

  /** Null while the week's questions are still being answered. */
  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
