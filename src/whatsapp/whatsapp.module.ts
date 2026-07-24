import { Module } from '@nestjs/common';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { VoiceTranscriptionService } from './voice-transcription.service';
import { AbenaTTSService } from './abena-tts.service';

@Module({
  controllers: [WhatsAppController],
  providers: [WhatsAppService, VoiceTranscriptionService, AbenaTTSService],
  exports: [WhatsAppService, VoiceTranscriptionService, AbenaTTSService],
})
export class WhatsAppModule {}
