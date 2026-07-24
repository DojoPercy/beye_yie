import { Module } from '@nestjs/common';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { VoiceTranscriptionService } from './voice-transcription.service';
import { AbenaTTSService } from './abena-tts.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tip } from '../database/entities/tip.entity';
import { TipAudioAssetService } from './tip-audio-asset.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tip])],
  controllers: [WhatsAppController],
  providers: [WhatsAppService, VoiceTranscriptionService, AbenaTTSService, TipAudioAssetService],
  exports: [WhatsAppService, VoiceTranscriptionService, AbenaTTSService, TipAudioAssetService],
})
export class WhatsAppModule {}
