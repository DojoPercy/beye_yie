import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { Category } from './worker.entity';

/** A pain report parsed from an on-demand message. Powers adaptive tips + impact. */
@Entity('pain_events')
@Index(['userId', 'createdAt'])
export class PainEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar' })
  bodyPart: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  category: Category | null;

  /** Matched tip id, if any (L1/H2/…). */
  @Column({ type: 'varchar', length: 8, nullable: true })
  matchedTipId: string | null;

  /** Numeric Rating Scale 0–10 when the message implied a severity; else null. */
  @Column({ type: 'int', nullable: true })
  severityNrs: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
