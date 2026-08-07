import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type Language = 'tw' | 'en';
export type Category = 'load' | 'hand' | 'sitting';
/** The main market-work task a worker says puts the most strain on her body. */
export type WorkActivity =
  | 'carrying'
  | 'head_loading'
  | 'standing_walking'
  | 'bending_squatting'
  | 'repetitive_hand_work'
  | 'sitting_leaning';
export type Frequency = 'daily' | 'alternate' | 'weekly';
/** What she sells — shapes both the risk profile and the tips that fit her day. */
export type GoodsType =
  | 'produce'
  | 'grains'
  | 'fish_meat'
  | 'cooked_food'
  | 'provisions'
  | 'clothing_textiles'
  | 'hardware_household'
  | 'other';

/**
 * A worker (market woman / manual worker) identified by their WhatsApp phone.
 * Mirrors the dashboard schema in the OT content pack: identity + the fields
 * that power personalization and the GHS impact dashboard.
 */
@Entity('workers')
export class Worker {
  /** WhatsApp phone, e.g. 233XXXXXXXXX — also the LangGraph thread id. */
  @PrimaryColumn({ type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar', nullable: true })
  name: string | null;

  @Column({ type: 'varchar', length: 4, default: 'en' })
  language: Language;

  /**
   * Registration profile (spec §1). All nullable and skippable: a worker who
   * abandons these questions still gets tips and the safety gate, and OT risk
   * scoring simply treats the missing field as unknown.
   */
  @Column({ type: 'int', nullable: true })
  age: number | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  goodsSold: GoodsType | null;

  /** Free text — market names are too varied and local to enumerate. */
  @Column({ type: 'varchar', length: 80, nullable: true })
  marketLocation: string | null;

  /** Typical hours worked per day. Band midpoint when chosen from the menu. */
  @Column({ type: 'int', nullable: true })
  avgWorkHours: number | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  category: Category | null;

  /**
   * Kept separately from `category`: one market woman may do several jobs,
   * while this captures the activity most likely to need OT guidance.
   */
  @Column({ type: 'varchar', length: 24, nullable: true })
  workActivity: WorkActivity | null;

  /** Preferred daily-tip send time, "HH:mm" 24h, worker's local (Africa/Accra). */
  @Column({ type: 'varchar', length: 5, default: '06:30' })
  tipTime: string;

  @Column({ type: 'varchar', length: 16, default: 'daily' })
  frequency: Frequency;

  /**
   * When to ask the daily check-in, "HH:mm" Accra. Defaults to the evening:
   * "how was today?" only makes sense once the working day is behind her, and
   * it keeps the check-in well clear of the morning tip.
   */
  @Column({ type: 'varchar', length: 5, default: '19:30' })
  checkInTime: string;

  /** Daily check-in progress; null when she is not mid-check-in. */
  @Column({ type: 'varchar', length: 24, nullable: true })
  dailyCheckInStep: string | null;

  /** Last day (YYYY-MM-DD, Accra) she was prompted — prevents double-asking. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  lastDailyCheckInDate: string | null;

  /** Weekly occupational-performance progress; null when not in that flow. */
  @Column({ type: 'varchar', length: 24, nullable: true })
  functionStep: string | null;

  /** Onboarding progress; null once complete. */
  @Column({ type: 'varchar', length: 24, nullable: true })
  onboardingStep: string | null;

  @Column({ type: 'boolean', default: false })
  onboarded: boolean;

  /** Initial-assessment progress (spec §2); null when not in the flow. */
  @Column({ type: 'varchar', length: 24, nullable: true })
  assessmentStep: string | null;

  /** Set once the initial assessment is finished, so it is only asked once. */
  @Column({ type: 'timestamptz', nullable: true })
  assessmentCompletedAt: Date | null;

  /**
   * Set only after Meta-signed inbound traffic for this exact WhatsApp ID.
   * Proactive messages must never start from an unverified stored recipient.
   */
  @Column({ type: 'timestamptz', nullable: true })
  lastVerifiedInboundAt: Date | null;

  /** Which daily-tip sequence index they last received (rotates the 9 tips). */
  @Column({ type: 'int', default: 0 })
  tipCursor: number;

  /** Last day (YYYY-MM-DD, Accra) a daily tip was pushed — prevents double-send. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  lastTipDate: string | null;

  @CreateDateColumn()
  signupDate: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
