import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  CheckIn,
  ConversationTurn,
  PainEvent,
  ProcessedMessage,
  RedFlagReferral,
  Tip,
  TipDelivery,
  Worker,
} from '../database/entities';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

import { WorkerService } from './worker/worker.service';
import { RedFlagService } from './safety/red-flag.service';
import { EscalationService } from './escalation/escalation.service';
import { OnboardingService } from './onboarding/onboarding.service';
import { PersonalizationService } from './personalization/personalization.service';
import { GroundedAgentService } from './grounded/grounded-agent.service';
import { PipelineService } from './pipeline.service';
import { InboundProcessor } from './inbound.processor';
import { TipVoiceOfferService } from './tips/tip-voice-offer.service';

@Module({
  imports: [
    WhatsAppModule,
    TypeOrmModule.forFeature([
      Worker,
      Tip,
      CheckIn,
      PainEvent,
      RedFlagReferral,
      TipDelivery,
      ConversationTurn,
      ProcessedMessage,
    ]),
  ],
  providers: [
    WorkerService,
    RedFlagService,
    EscalationService,
    OnboardingService,
    PersonalizationService,
    GroundedAgentService,
    TipVoiceOfferService,
    PipelineService,
    InboundProcessor,
  ],
  exports: [WorkerService, PersonalizationService, EscalationService, TipVoiceOfferService],
})
export class AgentModule {}
