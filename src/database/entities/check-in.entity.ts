import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type CheckInValue = 'worse' | 'same' | 'better';

/** Weekly "how is your [body part]?" 1–3 reply. Feeds personalization + impact. */
@Entity('check_ins')
@Index(['userId', 'createdAt'])
export class CheckIn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar' })
  bodyPart: string;

  @Column({ type: 'varchar', length: 8 })
  value: CheckInValue;

  /** ISO week key, e.g. 2026-W30 */
  @Column({ type: 'varchar', length: 8 })
  week: string;

  @CreateDateColumn()
  createdAt: Date;
}
