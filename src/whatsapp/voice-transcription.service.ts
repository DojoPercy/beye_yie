import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import Groq from 'groq-sdk';

const GRAPH = 'https://graph.facebook.com/v19.0';

/**
 * Downloads a WhatsApp audio media file and transcribes it.
 *
 * IMPORTANT (see architecture plan §06): Whisper is a low-resource model for
 * Twi/Akan and can produce fluent-but-wrong transcripts. For a health bot that
 * is dangerous, so voice input is OFF by default and treated as English-biased
 * best-effort. Bot-to-worker audio OUT (pre-recorded Twi tips) is always safe;
 * it is only Twi speech-IN that is unreliable. A dedicated Twi ASR provider
 * (e.g. Abena AI) is the Phase-2 path if voice input proves important.
 */
@Injectable()
export class VoiceTranscriptionService {
  private readonly logger = new Logger(VoiceTranscriptionService.name);
  private readonly openai: OpenAI;
  private readonly groq: Groq;

  constructor(private readonly config: ConfigService) {
    this.openai = new OpenAI({ apiKey: config.get<string>('llm.openaiKey') || 'no-key' });
    this.groq = new Groq({ apiKey: config.get<string>('voice.groqKey') || 'no-key' });
  }

  isEnabled(): boolean {
    return this.config.get<boolean>('voice.enabled') === true;
  }

  async transcribe(mediaId: string): Promise<string | null> {
    if (!this.isEnabled()) return null;
    const token = this.config.get<string>('whatsapp.token');
    if (!token) {
      this.logger.warn('voice transcription skipped: no WhatsApp token');
      return null;
    }
    try {
      const metaRes = await fetch(`${GRAPH}/${mediaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!metaRes.ok) return null;
      const { url } = (await metaRes.json()) as { url: string };

      const fileRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!fileRes.ok) return null;
      const buf = Buffer.from(await fileRes.arrayBuffer());
      const file = new File([buf], 'note.ogg', { type: 'audio/ogg' });

      const provider = this.config.get<string>('voice.provider');
      const text =
        provider === 'groq'
          ? (await this.groq.audio.transcriptions.create({ file, model: 'whisper-large-v3' })).text
          : (await this.openai.audio.transcriptions.create({ file, model: 'whisper-1' })).text;

      return text?.trim() || null;
    } catch (err) {
      this.logger.error(`transcription error: ${(err as Error).message}`);
      return null;
    }
  }
}
