import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';

import configuration from './config/configuration';
import { ENTITIES } from './database/entities';
import { MessagingModule } from './messaging/messaging.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { AgentModule } from './agent/agent.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('databaseUrl'),
        entities: ENTITIES,
        // Demo convenience. In production use migrations instead.
        synchronize: true,
      }),
    }),
    MessagingModule,
    WhatsAppModule,
    AgentModule,
    SchedulerModule,
    DashboardModule,
  ],
})
export class AppModule {}
