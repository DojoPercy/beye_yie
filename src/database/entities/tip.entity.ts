import { Column, Entity, PrimaryColumn } from 'typeorm';
import { Category } from './worker.entity';

/**
 * One of the 9 vetted tips (3 categories × 3). Bilingual text + audio file
 * names. For Layer ① push these also become approved WhatsApp utility
 * templates — templateName holds the Meta template id once approved.
 */
@Entity('tips')
export class Tip {
  /** e.g. L1, H2, S3 */
  @PrimaryColumn({ type: 'varchar', length: 8 })
  id: string;

  @Column({ type: 'varchar', length: 16 })
  category: Category;

  @Column({ type: 'varchar' })
  focus: string;

  @Column({ type: 'text' })
  textEn: string;

  /** DRAFT until a native Twi speaker verifies (see content pack). */
  @Column({ type: 'text' })
  textTw: string;

  @Column({ type: 'varchar', nullable: true })
  audioEnUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  audioTwUrl: string | null;

  /** Meta-approved utility template name; null until approved (Phase 2). */
  @Column({ type: 'varchar', nullable: true })
  templateName: string | null;

  /** Ordering within a category for the rotation. */
  @Column({ type: 'int', default: 0 })
  seq: number;
}
