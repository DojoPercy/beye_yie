import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Assessment,
  CheckIn,
  DailyCheckIn,
  FunctionScore,
  PainEvent,
  RedFlagReferral,
  TipDelivery,
  Worker,
} from '../database/entities';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([
      Worker,
      PainEvent,
      CheckIn,
      RedFlagReferral,
      TipDelivery,
      Assessment,
      DailyCheckIn,
      FunctionScore,
    ])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
