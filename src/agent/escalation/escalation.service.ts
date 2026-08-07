import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedFlagReferral, ReferralKind } from '../../database/entities/red-flag-referral.entity';
import { Language } from '../../database/entities/worker.entity';
import { WhatsAppOutbound } from '../../whatsapp/whatsapp.types';

/**
 * Layer ③ — human handoff. When the safety gate fires, the bot stops advising,
 * shares a REAL OT / clinic / GHS contact, and offers a callback. Every
 * escalation is logged for safety accountability and the GHS dashboard.
 */
@Injectable()
export class EscalationService {
  private readonly logger = new Logger(EscalationService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(RedFlagReferral)
    private readonly referrals: Repository<RedFlagReferral>,
  ) {}

  /** Log a red-flag escalation and return the handoff messages to send. */
  async escalate(
    userId: string,
    reason: string,
    triggerText: string,
    language: Language,
  ): Promise<WhatsAppOutbound[]> {
    await this.referrals.save(
      this.referrals.create({ userId, kind: 'red_flag', reason, triggerText, callbackRequested: false }),
    );
    this.logger.warn(`RED FLAG escalation for ${userId}: ${reason}`);

    const name = this.config.get<string>('handoff.name');
    const contact = this.config.get<string>('handoff.contact');

    const body =
      language === 'tw'
        ? `Yei hia ɔyaresafo ankasa. 🚑\nWobɛtumi ne occupational therapist akasa wɔ ha:\n${name} — ${contact}\nAnaa fa "CALL" bua na yɛbɛ ma wɔafrɛ wo.`
        : `This may need a real professional. 🚑\nYou can talk to an occupational therapist here:\n${name} — ${contact}\nOr reply CALL and we'll ask them to reach you.`;

    return [
      { type: 'text', body },
      {
        type: 'buttons',
        body: language === 'tw' ? 'Wopɛ sɛ wɔfrɛ wo?' : 'Would you like a callback?',
        buttons: [{ id: 'CALL', title: language === 'tw' ? 'Frɛ me' : 'Call me' }],
      },
    ];
  }

  /**
   * A non-urgent handoff: the assessment graded her high risk, or her tracked
   * symptoms are worsening. Same contact and callback offer as an emergency,
   * but calm wording — "worth seeing someone", not "this may be serious" —
   * because overstating a routine referral teaches workers to discount the
   * urgent ones.
   */
  async referRoutine(
    userId: string,
    kind: Extract<ReferralKind, 'assessment' | 'trend'>,
    reason: string,
    language: Language,
  ): Promise<WhatsAppOutbound[]> {
    await this.referrals.save(
      this.referrals.create({ userId, kind, reason, triggerText: null, callbackRequested: false }),
    );
    this.logger.log(`${kind} referral for ${userId}: ${reason}`);

    const name = this.config.get<string>('handoff.name');
    const contact = this.config.get<string>('handoff.contact');

    const body =
      language === 'tw'
        ? `Sɛ wopɛ a, wubetumi ne occupational therapist akasa:\n${name} — ${contact}\nAnaa fa "CALL" bua na yɛbɛma wɔafrɛ wo.`
        : `When you can, it's worth talking to an occupational therapist:\n${name} — ${contact}\nOr reply CALL and we'll ask them to reach you.`;

    return [
      { type: 'text', body },
      {
        type: 'buttons',
        body: language === 'tw' ? 'Wopɛ sɛ wɔfrɛ wo?' : 'Would you like a callback?',
        buttons: [{ id: 'CALL', title: language === 'tw' ? 'Frɛ me' : 'Call me' }],
      },
    ];
  }

  /** Worker replied CALL — mark the most recent open referral for callback. */
  async requestCallback(userId: string, language: Language): Promise<WhatsAppOutbound[]> {
    const latest = await this.referrals.findOne({
      where: { userId, callbackRequested: false },
      order: { createdAt: 'DESC' },
    });
    if (latest) {
      latest.callbackRequested = true;
      await this.referrals.save(latest);
    }
    const body =
      language === 'tw'
        ? 'Yɛagye wo din. Ɔyaresafo bɛfrɛ wo. Hwɛ wo ho so. 💚'
        : "Thank you. We've logged your request and an occupational therapist will reach out. Take care of yourself. 💚";
    return [{ type: 'text', body }];
  }
}
