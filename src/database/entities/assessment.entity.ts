import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** How long the symptoms have been present (spec §2: duration of symptoms). */
export type DurationBand = 'days' | 'weeks_1_4' | 'months_1_3' | 'months_3_plus';

/** The activity the worker says makes the pain worse. */
export type Aggravator =
  | 'lifting_carrying'
  | 'bending_squatting'
  | 'standing_long'
  | 'sitting_long'
  | 'hand_work'
  | 'walking'
  | 'none';

/**
 * Effect on work and daily activities. This is the occupational-performance
 * axis — it matters more to an OT than the pain number alone, and it carries
 * the most weight in {@link RiskService}.
 */
export type FunctionImpact = 'none' | 'a_little' | 'a_lot' | 'cannot_work';

/** What she has already tried, so advice doesn't repeat a failed step. */
export type PriorTreatment =
  | 'none'
  | 'chemist_medicine'
  | 'massage_balm'
  | 'clinic_hospital'
  | 'traditional';

export type RiskLevel = 'low' | 'moderate' | 'high';

/**
 * The initial OT-focused assessment (spec §2), taken once after registration.
 * A row is created as a draft when the flow starts and marked complete when
 * the last answer lands, so an abandoned assessment can be resumed rather than
 * restarted.
 *
 * This is an intake questionnaire, never a diagnosis. `riskLevel` decides how
 * urgently to suggest a professional — it is not a clinical grading.
 */
@Entity('assessments')
@Index(['userId', 'createdAt'])
export class Assessment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'boolean', nullable: true })
  painPresent: boolean | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  bodyPart: string | null;

  /** Numeric Rating Scale 0–10, exact when typed, band midpoint when tapped. */
  @Column({ type: 'int', nullable: true })
  nrs: number | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  durationBand: DurationBand | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  aggravator: Aggravator | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  functionImpact: FunctionImpact | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  priorTreatment: PriorTreatment | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  riskLevel: RiskLevel | null;

  /** Why that level was assigned — shown to the OT, not to the worker. */
  @Column({ type: 'text', nullable: true })
  riskReason: string | null;

  /** Null while the flow is still in progress. */
  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
