import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { TipSchedulerService } from './tip-scheduler.service';
import { CheckInSchedulerService } from './check-in-scheduler.service';

@Module({
  imports: [AgentModule, WhatsAppModule],
  providers: [TipSchedulerService, CheckInSchedulerService],
})
export class SchedulerModule {}
