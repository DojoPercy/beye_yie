import { Worker } from './worker.entity';
import { Tip } from './tip.entity';
import { CheckIn } from './check-in.entity';
import { PainEvent } from './pain-event.entity';
import { RedFlagReferral } from './red-flag-referral.entity';
import { TipDelivery } from './tip-delivery.entity';
import { ConversationTurn } from './conversation-turn.entity';
import { ProcessedMessage } from './processed-message.entity';
import { Assessment } from './assessment.entity';
import { DailyCheckIn } from './daily-check-in.entity';
import { FunctionScore } from './function-score.entity';

export const ENTITIES = [
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
];

export {
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
};
