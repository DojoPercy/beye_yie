import { Module } from '@nestjs/common';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { VoiceTranscriptionService } from './voice-transcription.service';

@Module({
  controllers: [WhatsAppController],
  providers: [WhatsAppService, VoiceTranscriptionService],
  exports: [WhatsAppService, VoiceTranscriptionService],
})
export class WhatsAppModule {}
