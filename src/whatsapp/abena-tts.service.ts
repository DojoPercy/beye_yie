import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { writeFile, mkdir, readdir, stat, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { createHash, randomUUID } from 'crypto';
import { spawn } from 'child_process';

/**
 * Abena AI Text-to-Speech service for Ghanaian-accent voices.
 *
 * API docs: https://abena.mobobi.com/playground/sdk/docs/
 * Free tier: 50 requests without an API key, no sign-up required.
 *
 * IMPORTANT (WhatsApp): the Abena API only returns WAV audio. WhatsApp
 * Cloud API does not accept WAV for audio/voice messages — only
 * AAC, AMR, MP3, M4A, or OGG (Opus codec). This service transcodes
 * every result to OGG/Opus (16kHz mono, ~16kbps) with ffmpeg so the
 * output can be sent straight to WhatsApp as a native voice note.
 * Requires the `ffmpeg` binary to be present on PATH.
 */

export interface SynthesizeResult {
  /** Relative path, e.g. /audio/tts_xxx.ogg */
  url: string;
  /** Absolute local file path for a trusted caller that must upload to Meta. */
  filePath: string;
  /** Absolute URL (only set if `abenaTts.publicBaseUrl` is configured) — use this for WhatsApp media payloads */
  absoluteUrl: string | null;
  mimeType: 'audio/ogg; codecs=opus';
  durationSeconds: number;
  quality: string;
  voice: string;
  /** True if the API silently downgraded quality due to demand */
  degraded: boolean;
}

type AbenaApiResponse = {
  status: 'success' | 'error';
  voice: string;
  audio_base64: string;
  duration_seconds: number;
  mime_type: string;
  quality: string;
  notice?: string;
  message?: string;
};

const KNOWN_VOICES = new Set([
  'abena_twi_high',
  'abena_twi_lite',
  'kobby_gpe',
  'akua_eng',
  'kwabena_eng',
  'chioma_eng',
  'chioma_whispering_eng',
  'mawuli_ewe',
  'james_pcm',
  'amani_swh',
  'abubakar_hau',
  'folami_yor',
]);

const MAX_CHARS_PER_REQUEST = 500;
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 3;
const RETRYABLE_STATUSES = new Set([429, 500, 503]);

@Injectable()
export class AbenaTTSService {
  private readonly logger = new Logger(AbenaTTSService.name);
  private readonly apiUrl =
    'https://abena.mobobi.com/playground/api/v1/tts/synthesize/';
  private readonly audioDir = join(process.cwd(), 'public', 'audio');
  private readonly tmpDir = join(process.cwd(), 'tmp', 'abena-tts');

  /** In-memory fast path over deterministic, content-addressed OGG files.
   * This only safely applies to reviewed, non-personal content (welcome
   * clips, fixed tips). Do not persist individualized health responses here. */
  private readonly cache = new Map<string, SynthesizeResult>();
  /** Collapse concurrent requests for the exact same reviewed script. */
  private readonly inFlight = new Map<string, Promise<SynthesizeResult | null>>();
  private readonly directoriesReady: Promise<void>;

  constructor(private readonly config: ConfigService) {
    this.directoriesReady = this.ensureDirs();
  }

  private async ensureDirs(): Promise<void> {
    for (const dir of [this.audioDir, this.tmpDir]) {
      if (!existsSync(dir)) {
        try {
          await mkdir(dir, { recursive: true });
        } catch (err) {
          this.logger.warn(`Failed to create directory ${dir}: ${(err as Error).message}`);
        }
      }
    }
  }

  isEnabled(): boolean {
    return this.config.get<boolean>('abenaTts.enabled') === true;
  }

  /**
   * Convert text to speech using Abena AI TTS, returning WhatsApp-ready
   * OGG/Opus audio. Text longer than 500 characters is automatically
   * split on sentence boundaries, synthesized in parts, and stitched
   * back into a single audio file — instead of being silently truncated.
   */
  async synthesize(
    text: string,
    voice?: string,
    speed = 1.0,
  ): Promise<SynthesizeResult | null> {
    if (!this.isEnabled()) {
      this.logger.debug('Abena TTS is disabled');
      return null;
    }

    const cleanText = text.trim();
    if (!cleanText) return null;

    const selectedVoice = this.resolveVoice(voice);
    const clampedSpeed = Math.min(2.0, Math.max(0.5, speed));

    const cacheKey = this.hashInput(cleanText, selectedVoice, clampedSpeed);
    await this.directoriesReady;

    const cached = this.cache.get(cacheKey);
    if (cached && existsSync(this.oggPath(cacheKey))) {
      return cached;
    }
    if (existsSync(this.oggPath(cacheKey))) {
      // The output filename is derived from the full synthesis input. This
      // lets a persisted volume serve a reviewed asset after a restart without
      // calling the provider again. Duration is unavailable without decoding,
      // and is not needed to send the media.
      const result = this.resultFor(cacheKey, selectedVoice, 0, 'cached', false);
      this.cache.set(cacheKey, result);
      return result;
    }

    const existing = this.inFlight.get(cacheKey);
    if (existing) return existing;

    const generation = this.generate(cleanText, selectedVoice, clampedSpeed, cacheKey);
    this.inFlight.set(cacheKey, generation);
    try {
      return await generation;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  private async generate(
    cleanText: string,
    selectedVoice: string,
    clampedSpeed: number,
    cacheKey: string,
  ): Promise<SynthesizeResult | null> {
    const parts: { wavPath: string; durationSeconds: number; quality: string; degraded: boolean }[] = [];
    let finalWav: string | undefined;
    try {
      const chunks = this.splitIntoChunks(cleanText, MAX_CHARS_PER_REQUEST);

      for (const chunk of chunks) {
        const apiResult = await this.requestSpeechWithRetry(chunk, selectedVoice, clampedSpeed);
        if (!apiResult) return null;

        const wavPath = join(this.tmpDir, `${randomUUID()}.wav`);
        await writeFile(wavPath, Buffer.from(apiResult.audio_base64, 'base64'));

        parts.push({
          wavPath,
          durationSeconds: apiResult.duration_seconds,
          quality: apiResult.quality,
          degraded: Boolean(apiResult.notice),
        });
      }

      finalWav =
        parts.length === 1 ? parts[0].wavPath : await this.concatWav(parts.map((p) => p.wavPath));

      await this.transcodeToOggOpus(finalWav, this.oggPath(cacheKey));

      const result = this.resultFor(
        cacheKey,
        selectedVoice,
        parts.reduce((sum, p) => sum + p.durationSeconds, 0),
        parts.some((p) => p.quality !== 'high') ? 'medium' : 'high',
        parts.some((p) => p.degraded),
      );

      this.cache.set(cacheKey, result);
      this.logger.debug(
        `Generated TTS audio: ${this.filename(cacheKey)} (${result.durationSeconds.toFixed(2)}s, ${chunks.length} chunk(s), quality=${result.quality})`,
      );

      return result;
    } catch (err) {
      this.logger.error(`TTS synthesis error: ${(err as Error).message}`);
      return null;
    } finally {
      // Remove all provider WAVs even when ffmpeg or a later request fails.
      const tempFiles = new Set(parts.map((part) => part.wavPath));
      if (finalWav && !parts.some((part) => part.wavPath === finalWav)) tempFiles.add(finalWav);
      await Promise.all([...tempFiles].map((file) => unlink(file).catch(() => undefined)));
    }
  }

  /** Single API call with timeout + exponential backoff on retryable errors. */
  private async requestSpeechWithRetry(
    text: string,
    voice: string,
    speed: number,
  ): Promise<AbenaApiResponse | null> {
    const apiKey = this.config.get<string>('abenaTts.apiKey');
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ text, voice, speed }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.status === 401) {
          this.logger.error('Abena TTS free-tier/API quota exhausted (401)');
          return null; // not retryable — needs a paid key
        }

        if (!response.ok) {
          const body = await response.json().catch(() => ({}) as Partial<AbenaApiResponse>);
          lastError = body.message ?? `HTTP ${response.status}`;

          if (RETRYABLE_STATUSES.has(response.status) && attempt < MAX_RETRIES) {
            const backoffMs = 300 * 2 ** attempt + Math.random() * 200;
            this.logger.warn(
              `Abena TTS retryable error (${response.status}): ${lastError}. Retrying in ${Math.round(backoffMs)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
            );
            await new Promise((r) => setTimeout(r, backoffMs));
            continue;
          }

          this.logger.error(`Abena TTS API error: ${response.status} - ${lastError}`);
          return null;
        }

        const data = (await response.json()) as AbenaApiResponse;
        if (data.status !== 'success' || !data.audio_base64) {
          this.logger.error('Invalid response from Abena TTS API');
          return null;
        }
        if (data.notice) {
          this.logger.warn(`Abena TTS notice: ${data.notice}`);
        }
        return data;
      } catch (err) {
        clearTimeout(timeout);
        const isAbort = (err as Error).name === 'AbortError';
        lastError = isAbort ? 'timeout' : (err as Error).message;

        if (attempt < MAX_RETRIES) {
          const backoffMs = 300 * 2 ** attempt;
          this.logger.warn(`Abena TTS request failed (${lastError}), retrying in ${backoffMs}ms`);
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
      }
    }

    this.logger.error(`Abena TTS failed after ${MAX_RETRIES + 1} attempts: ${lastError}`);
    return null;
  }

  /** Transcode WAV -> OGG/Opus, tuned for WhatsApp voice notes (small, mono, voice-optimized). */
  private transcodeToOggOpus(inputWavPath: string, outputOggPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-i', inputWavPath,
        '-c:a', 'libopus',
        '-b:a', '16k',
        '-ar', '16000',
        '-ac', '1',
        '-application', 'voip',
        outputOggPath,
      ]);

      let stderr = '';
      ffmpeg.stderr.on('data', (d) => (stderr += d.toString()));
      ffmpeg.on('error', (err) =>
        reject(new Error(`ffmpeg not available or failed to start: ${err.message}`)),
      );
      ffmpeg.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
      });
    });
  }

  /** Concatenate multiple WAV parts (from chunked long text) into one file before transcoding. */
  private concatWav(wavPaths: string[]): Promise<string> {
    const listPath = join(this.tmpDir, `${randomUUID()}.txt`);
    const outputPath = join(this.tmpDir, `${randomUUID()}-merged.wav`);
    const listContent = wavPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');

    return writeFile(listPath, listContent).then(
      () =>
        new Promise<string>((resolve, reject) => {
          const ffmpeg = spawn('ffmpeg', [
            '-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath,
          ]);
          let stderr = '';
          ffmpeg.stderr.on('data', (d) => (stderr += d.toString()));
          ffmpeg.on('error', (err) => reject(err));
          ffmpeg.on('close', (code) => {
            unlink(listPath).catch(() => undefined);
            if (code === 0) resolve(outputPath);
            else reject(new Error(`ffmpeg concat failed (${code}): ${stderr.slice(-500)}`));
          });
        }),
    );
  }

  /** Split long text on sentence boundaries so no chunk exceeds the API's 500-char limit. */
  private splitIntoChunks(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];

    const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
    const chunks: string[] = [];
    let current = '';

    for (const sentence of sentences) {
      if ((current + sentence).length > maxLen) {
        if (current.trim()) chunks.push(current.trim());
        // A single sentence longer than maxLen: hard-split on word boundaries.
        if (sentence.length > maxLen) {
          let remaining = sentence;
          while (remaining.length > maxLen) {
            const cut = remaining.lastIndexOf(' ', maxLen);
            const splitAt = cut > 0 ? cut : maxLen;
            chunks.push(remaining.slice(0, splitAt).trim());
            remaining = remaining.slice(splitAt).trim();
          }
          current = remaining;
        } else {
          current = sentence;
        }
      } else {
        current += sentence;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  }

  private resolveVoice(voice?: string): string {
    if (voice && KNOWN_VOICES.has(voice)) return voice;
    if (voice) {
      this.logger.warn(`Unknown voice "${voice}" requested — falling back to default`);
    }
    return this.getDefaultVoice();
  }

  private getDefaultVoice(): string {
    const configuredVoice = this.config.get<string>('abenaTts.defaultVoice');
    if (configuredVoice && KNOWN_VOICES.has(configuredVoice)) return configuredVoice;
    return 'abena_twi_high';
  }

  /** Get the appropriate voice for a given language/dialect used on WhatsApp. */
  getVoiceForLanguage(language: 'en' | 'tw' | 'gpe'): string {
    switch (language) {
      case 'tw':
        return 'abena_twi_high';
      case 'gpe':
        return 'kobby_gpe';
      case 'en':
        return 'akua_eng';
      default:
        return this.getDefaultVoice();
    }
  }

  isValidLength(text: string): boolean {
    return text.length <= MAX_CHARS_PER_REQUEST;
  }

  private hashInput(text: string, voice: string, speed: number): string {
    return createHash('sha256')
      .update(`abena-v1|ogg-opus-16k-mono-16kbps|${voice}|${speed}|${text}`)
      .digest('hex');
  }

  private filename(cacheKey: string): string {
    return `tts_${cacheKey}.ogg`;
  }

  private oggPath(cacheKey: string): string {
    return join(this.audioDir, this.filename(cacheKey));
  }

  private resultFor(
    cacheKey: string,
    voice: string,
    durationSeconds: number,
    quality: string,
    degraded: boolean,
  ): SynthesizeResult {
    const relativeUrl = `/audio/${this.filename(cacheKey)}`;
    const baseUrl = this.config.get<string>('abenaTts.publicBaseUrl');
    return {
      url: relativeUrl,
      filePath: this.oggPath(cacheKey),
      absoluteUrl: baseUrl ? new URL(relativeUrl, baseUrl).toString() : null,
      mimeType: 'audio/ogg; codecs=opus',
      durationSeconds,
      quality,
      voice,
      degraded,
    };
  }

  /**
   * Delete ephemeral generated audio files older than `maxAgeHours`. Never
   * point a configured welcome clip at this local cache; welcome clips should
   * be stored as immutable object-store/Meta media assets instead.
   */
  async cleanupOldFiles(maxAgeHours = 24): Promise<number> {
    if (!existsSync(this.audioDir)) return 0;

    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    const files = await readdir(this.audioDir);
    let deleted = 0;

    for (const file of files) {
      if (!/^tts_[a-f0-9]{64}\.ogg$/.test(file)) continue;
      const filePath = join(this.audioDir, file);
      try {
        const stats = await stat(filePath);
        if (stats.mtimeMs < cutoff) {
          await unlink(filePath);
          deleted++;
        }
      } catch (err) {
        this.logger.warn(`Failed to check/delete ${file}: ${(err as Error).message}`);
      }
    }

    if (deleted > 0) this.logger.debug(`Cleaned up ${deleted} old TTS audio file(s)`);
    return deleted;
  }
}
