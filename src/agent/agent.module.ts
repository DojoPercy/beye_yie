import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  CheckIn,
  ConversationTurn,
  PainEvent,
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
    ]),
  ],
  providers: [
    WorkerService,
    RedFlagService,
    EscalationService,
    OnboardingService,
    PersonalizationService,
    GroundedAgentService,
    PipelineService,
    InboundProcessor,
  ],
  exports: [WorkerService, PersonalizationService, EscalationService],
})
export class AgentModule {}
