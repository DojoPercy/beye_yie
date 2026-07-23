import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Engagement log: tips_sent / opened in the dashboard schema. */
@Entity('tip_deliveries')
@Index(['userId', 'sentAt'])
export class TipDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar', length: 8 })
  tipId: string;

  @CreateDateColumn({ name: 'sent_at' })
  sentAt: Date;

  /** Set when the worker later replies within the tip's conversation. */
  @Column({ type: 'timestamptz', nullable: true })
  openedAt: Date | null;
}
