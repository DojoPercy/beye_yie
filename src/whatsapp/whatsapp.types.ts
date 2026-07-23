/** Outbound message shapes the sender understands. */
export type WhatsAppOutbound =
  | { type: 'text'; body: string }
  | { type: 'audio'; link: string }
  | { type: 'buttons'; body: string; buttons: { id: string; title: string }[] }
  | { type: 'list'; body: string; button: string; rows: { id: string; title: string; description?: string }[] }
  | { type: 'template'; name: string; language: string; bodyParams?: string[] };

/** A normalized inbound message after we flatten Meta's webhook envelope. */
export interface NormalizedInbound {
  /** Sender's canonical WhatsApp ID, also the conversation thread id. */
  phone: string;
  /** Meta phone-number ID that received the message. */
  businessPhoneNumberId?: string;
  /** Free text; for audio this is the transcript (or '' if unavailable). */
  text: string;
  /** Interactive reply id (button/list selection), if any. */
  replyId?: string;
  /** Meta message id, for idempotency. */
  messageId: string;
  /** Audio media id when the worker sent a voice note. */
  audioMediaId?: string;
  /** Worker's WhatsApp profile name, if present. */
  profileName?: string;
}
