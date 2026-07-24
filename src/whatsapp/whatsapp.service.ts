import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { basename } from 'path';
import { readFile } from 'fs/promises';
import { NormalizedInbound, WhatsAppOutbound } from './whatsapp.types';

const GRAPH = 'https://graph.facebook.com/v19.0';
const WHATSAPP_ID = /^[1-9]\d{6,14}$/;

/**
 * Meta expects a WhatsApp ID (digits only, country code included), never a
 * display-formatted telephone number. Keep this conversion in one place so a
 * stored value can never accidentally change the recipient of a send.
 */
export function normalizeWhatsAppId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/[\s()+-]/g, '');
  return WHATSAPP_ID.test(normalized) ? normalized : null;
}

/**
 * Meta WhatsApp Cloud API client. Sends the message shapes the bot uses and
 * normalizes inbound webhook payloads. Mirrors washam-ai's whatsapp.service
 * but trimmed to what the OT bot needs.
 */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(private readonly config: ConfigService) {}

  private get token() {
    return this.config.get<string>('whatsapp.token');
  }
  private get phoneNumberId() {
    return this.config.get<string>('whatsapp.phoneNumberId');
  }
  private get appSecret() {
    return this.config.get<string>('whatsapp.appSecret');
  }
  private get timeoutMs() {
    return this.config.get<number>('whatsapp.sendTimeoutMs') ?? 8000;
  }

  async sendMany(to: string, messages: WhatsAppOutbound[]): Promise<boolean> {
    for (const m of messages) {
      if (!(await this.send(to, m))) return false;
    }
    return true;
  }

  /**
   * Mark an inbound message as read and show the typing indicator. Meta clears
   * the indicator automatically when we send our reply (or after ~25s). Best
   * effort — never throws, never blocks the pipeline.
   */
  async markReadAndTyping(messageId: string): Promise<void> {
    if (!this.token || !this.phoneNumberId || !messageId) return;
    try {
      await fetch(`${GRAPH}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
          typing_indicator: { type: 'text' },
        }),
      });
    } catch (err) {
      this.logger.warn(`markReadAndTyping failed: ${(err as Error).message}`);
    }
  }

  async send(to: string, message: WhatsAppOutbound): Promise<boolean> {
    const recipient = normalizeWhatsAppId(to);
    if (!recipient) {
      this.logger.error('blocked outbound message: recipient is not a valid WhatsApp ID');
      return false;
    }

    const payload = this.buildPayload(recipient, message);
    if (!this.token || !this.phoneNumberId) {
      // Demo / offline mode: log instead of hitting Meta.
      this.logger.warn(`[dry-run → ${this.maskId(recipient)}] ${JSON.stringify(payload.body ?? payload)}`);
      return true;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${GRAPH}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.error(`send failed to ${this.maskId(recipient)} (${res.status}): ${await res.text()}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`send error to ${this.maskId(recipient)}: ${(err as Error).message}`);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Upload a reviewed OGG/Opus file once to Meta and return its durable media
   * reference. The caller owns storing that ID against its fixed content.
   */
  async uploadAudioFile(filePath: string): Promise<string | null> {
    if (!this.token || !this.phoneNumberId) {
      this.logger.warn('cannot upload audio in dry-run mode: Meta token or phone-number ID is missing');
      return null;
    }

    try {
      const bytes = await readFile(filePath);
      const form = new FormData();
      form.set('messaging_product', 'whatsapp');
      form.set(
        'file',
        new Blob([bytes], { type: 'audio/ogg; codecs=opus' }),
        basename(filePath),
      );

      const response = await fetch(`${GRAPH}/${this.phoneNumberId}/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}` },
        body: form,
      });
      if (!response.ok) {
        this.logger.error(`audio upload failed (${response.status}): ${await response.text()}`);
        return null;
      }
      const data = (await response.json()) as { id?: string };
      if (!data.id) {
        this.logger.error('audio upload returned no Meta media ID');
        return null;
      }
      return data.id;
    } catch (err) {
      this.logger.error(`audio upload error: ${(err as Error).message}`);
      return null;
    }
  }

  private buildPayload(to: string, m: WhatsAppOutbound): any {
    const base = { messaging_product: 'whatsapp', to };
    switch (m.type) {
      case 'text':
        return { ...base, type: 'text', text: { body: m.body, preview_url: false } };
      case 'audio':
        return {
          ...base,
          type: 'audio',
          audio: 'mediaId' in m ? { id: m.mediaId } : { link: m.link },
        };
      case 'buttons':
        return {
          ...base,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: m.body },
            action: {
              buttons: m.buttons.slice(0, 3).map((b) => ({
                type: 'reply',
                reply: { id: b.id, title: b.title.slice(0, 20) },
              })),
            },
          },
        };
      case 'list':
        return {
          ...base,
          type: 'interactive',
          interactive: {
            type: 'list',
            body: { text: m.body },
            action: {
              button: m.button.slice(0, 20),
              sections: [
                {
                  title: 'Options',
                  rows: m.rows.slice(0, 10).map((r) => ({
                    id: r.id,
                    title: r.title.slice(0, 24),
                    description: r.description?.slice(0, 72),
                  })),
                },
              ],
            },
          },
        };
      case 'template':
        const components: any[] = [];
        if (m.bodyParams?.length) {
          components.push({
            type: 'body',
            parameters: m.bodyParams.map((t) => ({ type: 'text', text: t })),
          });
        }
        m.quickReplyPayloads?.forEach((payload, index) => {
          components.push({
            type: 'button',
            sub_type: 'quick_reply',
            index: String(index),
            parameters: [{ type: 'payload', payload }],
          });
        });
        return {
          ...base,
          type: 'template',
          template: {
            name: m.name,
            language: { code: m.language },
            components,
          },
        };
    }
  }

  /**
   * True only when this webhook event was addressed to this deployment's
   * configured WhatsApp business number. A WABA can contain multiple phone
   * numbers; without this check a webhook subscription for one can make this
   * bot answer conversations belonging to another.
   */
  isInboundForConfiguredNumber(inbound: NormalizedInbound): boolean {
    const configured = normalizeWhatsAppId(this.phoneNumberId);
    if (!configured) return true; // Offline mode has no business number to scope to.
    return inbound.businessPhoneNumberId === configured;
  }

  /** Verify that a webhook was sent by Meta before trusting its `from` field. */
  isWebhookSignatureValid(rawBody: Buffer | undefined, signature: string | undefined): boolean {
    // In offline mode no external message can be sent, so local webhook samples
    // remain convenient. A live sender must always have an app secret.
    if (!this.appSecret) return !this.token;
    if (!rawBody || !signature) return false;

    const expected = `sha256=${createHmac('sha256', this.appSecret).update(rawBody).digest('hex')}`;
    const actual = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
  }

  /** Flatten all Meta webhook messages into normalized inbound events. */
  normalizeInbounds(body: any): NormalizedInbound[] {
    const inbounds: NormalizedInbound[] = [];
    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value;
        const businessPhoneNumberId = normalizeWhatsAppId(value?.metadata?.phone_number_id) ?? undefined;
        const contacts = value?.contacts ?? [];
        for (const msg of value?.messages ?? []) {
          const phone = normalizeWhatsAppId(msg?.from);
          if (!phone || !msg?.id) {
            this.logger.warn('ignoring inbound event with an invalid WhatsApp sender or message ID');
            continue;
          }
          const profileName = contacts.find((contact: any) => contact?.wa_id === msg.from)?.profile?.name;
          const normalized = this.normalizeMessage(msg, phone, msg.id, profileName, businessPhoneNumberId);
          inbounds.push(normalized);
        }
      }
    }
    return inbounds;
  }

  /** Backwards-compatible helper for callers that only need the first event. */
  normalizeInbound(body: any): NormalizedInbound | null {
    return this.normalizeInbounds(body)[0] ?? null;
  }

  private normalizeMessage(
    msg: any,
    phone: string,
    messageId: string,
    profileName: string | undefined,
    businessPhoneNumberId: string | undefined,
  ): NormalizedInbound {
    // Interactive replies (buttons / list)
    if (msg.type === 'interactive') {
      const reply = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
      return {
        phone,
        messageId,
        profileName,
        businessPhoneNumberId,
        replyId: reply?.id,
        text: reply?.title ?? '',
      };
    }
    if (msg.type === 'button') {
      return { phone, messageId, profileName, businessPhoneNumberId, replyId: msg.button?.payload, text: msg.button?.text ?? '' };
    }
    if (msg.type === 'audio') {
      return { phone, messageId, profileName, businessPhoneNumberId, audioMediaId: msg.audio?.id, text: '' };
    }
    if (msg.type === 'text') {
      return { phone, messageId, profileName, businessPhoneNumberId, text: msg.text?.body ?? '' };
    }
    // Unsupported types (image, location, …) — treat as empty text.
    return { phone, messageId, profileName, businessPhoneNumberId, text: '' };
  }

  private maskId(value: string): string {
    return value.length <= 4 ? '****' : `${'*'.repeat(value.length - 4)}${value.slice(-4)}`;
  }
}
