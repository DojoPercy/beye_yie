import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type TurnLayer = 'onboarding' | 'on_demand' | 'escalation' | 'check_in' | 'periodic';

/**
 * Lightweight audit of every inbound→outbound exchange. Distinct from the
 * LangGraph checkpointer (which holds the model's working memory): this is the
 * human-readable log used for QA, safety review, and impact analytics.
 */
@Entity('conversation_turns')
@Index(['userId', 'createdAt'])
export class ConversationTurn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'text', nullable: true })
  inbound: string | null;

  @Column({ type: 'text', nullable: true })
  outbound: string | null;

  @Column({ type: 'varchar', length: 16 })
  layer: TurnLayer;

  /** Was voice input transcribed for this turn? */
  @Column({ type: 'boolean', default: false })
  fromVoice: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
