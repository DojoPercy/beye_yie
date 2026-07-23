import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationTurn, TurnLayer } from '../database/entities/conversation-turn.entity';
import { CheckInValue } from '../database/entities/check-in.entity';
import { Worker } from '../database/entities/worker.entity';
import { NormalizedInbound, WhatsAppOutbound } from '../whatsapp/whatsapp.types';
import { VoiceTranscriptionService } from '../whatsapp/voice-transcription.service';
import { WorkerService } from './worker/worker.service';
import { OnboardingService } from './onboarding/onboarding.service';
import { RedFlagService } from './safety/red-flag.service';
import { EscalationService } from './escalation/escalation.service';
import { GroundedAgentService } from './grounded/grounded-agent.service';
import { PersonalizationService } from './personalization/personalization.service';

/**
 * The OT message pipeline (architecture plan §02). Every inbound message flows:
 *
 *   0. resolve worker (+ transcribe voice, English-biased)
 *   1. RED-FLAG SAFETY GATE  → escalate + STOP  (before any advice)
 *   2. handle special replies (CALL callback, weekly check-in)
 *   3. onboarding state machine (if not yet onboarded)
 *   4. grounded on-demand agent
 *
 * The gate at step 1 is non-negotiable and always runs first.
 */
@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    private readonly workers: WorkerService,
    private readonly voice: VoiceTranscriptionService,
    private readonly redFlag: RedFlagService,
    private readonly escalation: EscalationService,
    private readonly onboarding: OnboardingService,
    private readonly grounded: GroundedAgentService,
    private readonly personalization: PersonalizationService,
    @InjectRepository(ConversationTurn)
    private readonly turns: Repository<ConversationTurn>,
  ) {}

  /** Process one inbound message and return the outbound messages to send. */
  async process(inbound: NormalizedInbound): Promise<{ to: string; messages: WhatsAppOutbound[] }> {
    const worker = await this.workers.getOrCreate(inbound.phone, inbound.profileName);

    // 0 — voice → text (best-effort, English-biased; see plan §06).
    let fromVoice = false;
    if (inbound.audioMediaId && !inbound.text) {
      const transcript = await this.voice.transcribe(inbound.audioMediaId);
      if (transcript) {
        inbound.text = transcript;
        fromVoice = true;
      } else {
        return this.reply(worker, inbound, this.voiceUnavailable(worker), 'on_demand', fromVoice);
      }
    }

    const text = inbound.text?.trim() ?? '';
    const replyId = inbound.replyId ?? '';

    // 1 — RED-FLAG SAFETY GATE. Runs before anything else, on real text.
    if (text) {
      const flag = await this.redFlag.check(text);
      if (flag.isRedFlag) {
        const messages = await this.escalation.escalate(worker.userId, flag.reason, text, worker.language);
        return this.reply(worker, inbound, messages, 'escalation', fromVoice);
      }
    }

    // 2a — callback request from an escalation.
    if (replyId === 'CALL' || /^call$/i.test(text)) {
      const messages = await this.escalation.requestCallback(worker.userId, worker.language);
      return this.reply(worker, inbound, messages, 'escalation', fromVoice);
    }

    // 2b — weekly check-in reply (ids like checkin_<bodyPart>_<value>).
    if (replyId.startsWith('checkin_')) {
      const messages = await this.handleCheckIn(worker, replyId);
      return this.reply(worker, inbound, messages, 'check_in', fromVoice);
    }

    // 3 — onboarding.
    if (this.onboarding.isOnboarding(worker)) {
      const messages = await this.onboarding.handle(worker, inbound);
      return this.reply(worker, inbound, messages, 'onboarding', fromVoice);
    }

    // 4 — grounded on-demand agent.
    const result = await this.grounded.answer(worker, text);
    const messages: WhatsAppOutbound[] = [{ type: 'text', body: result.reply }];
    return this.reply(worker, inbound, messages, 'on_demand', fromVoice);
  }

  private async handleCheckIn(worker: Worker, replyId: string): Promise<WhatsAppOutbound[]> {
    // checkin_<bodyPart>_<worse|same|better>
    const parts = replyId.split('_');
    const value = parts[parts.length - 1] as CheckInValue;
    const bodyPart = parts.slice(1, -1).join('_') || 'general';
    await this.personalization.recordCheckIn(worker.userId, bodyPart, value);

    const lang = worker.language;
    let body: string;
    if (value === 'worse') {
      body =
        lang === 'tw'
          ? `Yɛte aseɛ. Yɛbɛfa afotu a ɛfata bra wo. Sɛ ɛkɔ so den a, ka kyerɛ me.`
          : `Sorry it's worse. We'll keep sending tips that help. If it gets bad, tell me and I can share who to talk to.`;
    } else if (value === 'same') {
      body = lang === 'tw' ? `Yɛada wo ase. Yɛnkɔ so mmɔ mmɔden. 💚` : `Thanks for letting us know. Let's keep at it together. 💚`;
    } else {
      body = lang === 'tw' ? `Ɛyɛ anigye! Kɔ so yɛ. 💪` : `That's great to hear! Keep it up. 💪`;
    }
    return [{ type: 'text', body }];
  }

  private voiceUnavailable(worker: Worker): WhatsAppOutbound[] {
    const body =
      worker.language === 'tw'
        ? 'Mentumi nte voice no yie. Mesrɛ wo, kyerɛw no anaa fa nɔmba paw.'
        : "I couldn't understand the voice note clearly. Please type your message, or tap a menu option.";
    return [{ type: 'text', body }];
  }

  /** Persist the turn and package the outbound. */
  private async reply(
    worker: Worker,
    inbound: NormalizedInbound,
    messages: WhatsAppOutbound[],
    layer: TurnLayer,
    fromVoice: boolean,
  ): Promise<{ to: string; messages: WhatsAppOutbound[] }> {
    const outboundText = messages
      .map((m) => ('body' in m ? m.body : m.type))
      .join(' | ');
    await this.turns.save(
      this.turns.create({
        userId: worker.userId,
        inbound: inbound.text || inbound.replyId || null,
        outbound: outboundText,
        layer,
        fromVoice,
      }),
    );
    return { to: worker.userId, messages };
  }
}
