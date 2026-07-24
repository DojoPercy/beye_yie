import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tip } from '../database/entities/tip.entity';
import { Language } from '../database/entities/worker.entity';
import { AbenaTTSService } from './abena-tts.service';
import { WhatsAppService } from './whatsapp.service';

/**
 * Generates fixed tip speech only when no Meta media ID exists, uploads it to
 * Meta once, then persists that ID on the Tip. Never pass user-specific text
 * to this service.
 */
@Injectable()
export class TipAudioAssetService {
  private readonly logger = new Logger(TipAudioAssetService.name);
  private readonly inFlight = new Map<string, Promise<string | null>>();

  constructor(
    @InjectRepository(Tip) private readonly tips: Repository<Tip>,
    private readonly tts: AbenaTTSService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  async ensureMediaId(tip: Tip, language: Language): Promise<string | null> {
    const storedId = language === 'tw' ? tip.audioTwMediaId : tip.audioEnMediaId;
    if (storedId) return storedId;

    const key = `${tip.id}:${language}`;
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const preparation = this.prepare(tip, language);
    this.inFlight.set(key, preparation);
    try {
      return await preparation;
    } finally {
      this.inFlight.delete(key);
    }
  }

  /** Create any missing fixed-tip assets. Intended for a release-time command. */
  async prepareAll(languages: Language[] = ['en', 'tw']): Promise<{ created: number; skipped: number; failed: number }> {
    const tips = await this.tips.find({ order: { category: 'ASC', seq: 'ASC' } });
    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const tip of tips) {
      for (const language of languages) {
        const before = language === 'tw' ? tip.audioTwMediaId : tip.audioEnMediaId;
        if (before) {
          skipped++;
          continue;
        }
        if (await this.ensureMediaId(tip, language)) created++;
        else failed++;
      }
    }
    return { created, skipped, failed };
  }

  private async prepare(tip: Tip, language: Language): Promise<string | null> {
    if (!this.tts.isEnabled()) {
      this.logger.warn(`did not create ${language} audio for ${tip.id}: Abena TTS is disabled`);
      return null;
    }

    const text = language === 'tw' ? tip.textTw : tip.textEn;
    const audio = await this.tts.synthesize(text, this.tts.getVoiceForLanguage(language));
    if (!audio) return null;

    const mediaId = await this.whatsapp.uploadAudioFile(audio.filePath);
    if (!mediaId) return null;

    if (language === 'tw') tip.audioTwMediaId = mediaId;
    else tip.audioEnMediaId = mediaId;
    await this.tips.save(tip);
    this.logger.log(`saved Meta ${language} media ID for tip ${tip.id}`);
    return mediaId;
  }
}
