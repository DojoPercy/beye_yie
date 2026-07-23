import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NormalizedInbound, WhatsAppOutbound } from './whatsapp.types';

const GRAPH = 'https://graph.facebook.com/v19.0';

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
  private get timeoutMs() {
    return this.config.get<number>('whatsapp.sendTimeoutMs') ?? 8000;
  }

  async sendMany(to: string, messages: WhatsAppOutbound[]): Promise<void> {
    for (const m of messages) await this.send(to, m);
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

  async send(to: string, message: WhatsAppOutbound): Promise<void> {
    const payload = this.buildPayload(to, message);
    if (!this.token || !this.phoneNumberId) {
      // Demo / offline mode: log instead of hitting Meta.
      this.logger.warn(`[dry-run → ${to}] ${JSON.stringify(payload.body ?? payload)}`);
      return;
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
        this.logger.error(`send failed ${res.status}: ${await res.text()}`);
      }
    } catch (err) {
      this.logger.error(`send error to ${to}: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private buildPayload(to: string, m: WhatsAppOutbound): any {
    const base = { messaging_product: 'whatsapp', to };
    switch (m.type) {
      case 'text':
        return { ...base, type: 'text', text: { body: m.body, preview_url: false } };
      case 'audio':
        return { ...base, type: 'audio', audio: { link: m.link } };
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
        return {
          ...base,
          type: 'template',
          template: {
            name: m.name,
            language: { code: m.language },
            components: m.bodyParams?.length
              ? [
                  {
                    type: 'body',
                    parameters: m.bodyParams.map((t) => ({ type: 'text', text: t })),
                  },
                ]
              : [],
          },
        };
    }
  }

  /** Flatten Meta's nested webhook envelope into a NormalizedInbound. */
  normalizeInbound(body: any): NormalizedInbound | null {
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    if (!msg) return null;

    const phone: string = msg.from;
    const messageId: string = msg.id;
    const profileName: string | undefined = value?.contacts?.[0]?.profile?.name;

    // Interactive replies (buttons / list)
    if (msg.type === 'interactive') {
      const reply = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
      return {
        phone,
        messageId,
        profileName,
        replyId: reply?.id,
        text: reply?.title ?? '',
      };
    }
    if (msg.type === 'button') {
      return { phone, messageId, profileName, replyId: msg.button?.payload, text: msg.button?.text ?? '' };
    }
    if (msg.type === 'audio') {
      return { phone, messageId, profileName, audioMediaId: msg.audio?.id, text: '' };
    }
    if (msg.type === 'text') {
      return { phone, messageId, profileName, text: msg.text?.body ?? '' };
    }
    // Unsupported types (image, location, …) — treat as empty text.
    return { phone, messageId, profileName, text: '' };
  }
}
