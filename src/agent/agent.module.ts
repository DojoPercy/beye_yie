import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  Assessment,
  CheckIn,
  DailyCheckIn,
  ConversationTurn,
  FunctionScore,
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
import { AssessmentService } from './assessment/assessment.service';
import { RiskService } from './assessment/risk.service';
import { DailyCheckInService } from './checkin/daily-check-in.service';
import { TrendService } from './trends/trend.service';
import { FunctionCheckService } from './function/function-check.service';

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
      Assessment,
      DailyCheckIn,
      FunctionScore,
    ]),
  ],
  providers: [
    WorkerService,
    RedFlagService,
    EscalationService,
    OnboardingService,
    RiskService,
    AssessmentService,
    TrendService,
    DailyCheckInService,
    FunctionCheckService,
    PersonalizationService,
    GroundedAgentService,
    TipVoiceOfferService,
    PipelineService,
    InboundProcessor,
  ],
  exports: [
    WorkerService,
    PersonalizationService,
    EscalationService,
    TipVoiceOfferService,
    AssessmentService,
    DailyCheckInService,
    TrendService,
    FunctionCheckService,
  ],
})
export class AgentModule {}
