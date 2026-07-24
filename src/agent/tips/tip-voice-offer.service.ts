import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppConfig } from '../../config/configuration';
import { Tip } from '../../database/entities/tip.entity';
import { Language, Worker } from '../../database/entities/worker.entity';
import { WhatsAppOutbound } from '../../whatsapp/whatsapp.types';

export type TipVoiceAction = {
  kind: 'play' | 'skip';
  tipId: string;
  language: Language;
};

/** Stable, authenticated-by-Meta quick-reply payloads for an offered tip. */
export function tipVoiceReplyId(kind: TipVoiceAction['kind'], tipId: string, language: Language): string {
  return `tip_voice_${kind}:${tipId}:${language}`;
}

export function parseTipVoiceReplyId(replyId: string): TipVoiceAction | null {
  const match = /^tip_voice_(play|skip):([A-Za-z0-9_-]{1,8}):(en|tw)$/.exec(replyId);
  if (!match) return null;
  return { kind: match[1] as TipVoiceAction['kind'], tipId: match[2], language: match[3] as Language };
}

/** Content and template builder for the fixed, reviewed daily tips. */
@Injectable()
export class TipVoiceOfferService {
  constructor(
    @InjectRepository(Tip) private readonly tips: Repository<Tip>,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  async firstFor(worker: Worker): Promise<Tip | null> {
    const category = worker.category ?? 'load';
    return this.tips.findOne({ where: { category }, order: { seq: 'ASC' } });
  }

  findById(id: string): Promise<Tip | null> {
    return this.tips.findOne({ where: { id } });
  }

  /**
   * Use the approved Meta utility template when configured. Until approval,
   * the exact same interaction remains usable as a free-form button inside
   * the worker's active 24-hour conversation.
   */
  buildOffer(worker: Worker, tip: Tip): WhatsAppOutbound[] {
    const language = worker.language;
    const text = language === 'tw' ? tip.textTw : tip.textEn;
    const playId = tipVoiceReplyId('play', tip.id, language);
    const skipId = tipVoiceReplyId('skip', tip.id, language);
    const templateName = this.config.get('tipVoiceOfferTemplate', { infer: true })?.[language];

    if (templateName) {
      return [
        {
          type: 'template',
          name: templateName,
          language,
          bodyParams: [worker.name ?? (language === 'tw' ? 'adamfo' : 'there'), text],
          quickReplyPayloads: [playId, skipId],
        },
      ];
    }

    const body =
      language === 'tw'
        ? `🌿 ${worker.name ? `${worker.name}, ` : ''}da yi afotu: ${text}\n\nWopɛ sɛ wutie no wɔ voice note mu?`
        : `🌿 ${worker.name ? `${worker.name}, ` : ""}today's tip: ${text}\n\nWant to hear it as a voice note?`;
    return [
      {
        type: 'buttons',
        body,
        buttons: [
          { id: playId, title: language === 'tw' ? '🔊 Tie voice' : '🔊 Play voice tip' },
          { id: skipId, title: language === 'tw' ? 'Dabi, meda wo ase' : 'No thanks' },
        ],
      },
    ];
  }
}
