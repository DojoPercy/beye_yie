import { ConfigService } from '@nestjs/config';
import configuration, { AppConfig } from '../src/config/configuration';
import AppDataSource from '../src/database/data-source';
import { Tip } from '../src/database/entities/tip.entity';
import { Language } from '../src/database/entities/worker.entity';
import { AbenaTTSService } from '../src/whatsapp/abena-tts.service';
import { TipAudioAssetService } from '../src/whatsapp/tip-audio-asset.service';
import { WhatsAppService } from '../src/whatsapp/whatsapp.service';

const target = process.argv[2] ?? 'en';
if (!['en', 'tw', 'all'].includes(target)) {
  console.error('Usage: npm run prepare:tip-audio -- <en|tw|all>');
  process.exit(1);
}

const languages: Language[] = target === 'all' ? ['en', 'tw'] : [target as Language];
if (languages.includes('tw') && process.env.TIP_AUDIO_TWI_REVIEWED !== 'true') {
  console.error('Refusing to generate Twi tip audio until a native speaker and OT have approved the source text. Set TIP_AUDIO_TWI_REVIEWED=true after review.');
  process.exit(1);
}

async function run(): Promise<void> {
  const appConfig = configuration();
  if (!appConfig.abenaTts.enabled) {
    throw new Error('Set ABENA_TTS_ENABLED=true before preparing tip audio.');
  }
  if (!appConfig.whatsapp.token || !appConfig.whatsapp.phoneNumberId) {
    throw new Error('Set META_WHATSAPP_TOKEN and META_PHONE_NUMBER_ID before preparing tip audio.');
  }

  await AppDataSource.initialize();
  try {
    const config = new ConfigService<AppConfig>(appConfig as any);
    const tts = new AbenaTTSService(config);
    const whatsapp = new WhatsAppService(config);
    const assets = new TipAudioAssetService(AppDataSource.getRepository(Tip), tts, whatsapp);
    const result = await assets.prepareAll(languages);
    console.log(`Tip audio preparation complete: ${result.created} created, ${result.skipped} already stored, ${result.failed} failed.`);
    if (result.failed > 0) process.exitCode = 1;
  } finally {
    await AppDataSource.destroy();
  }
}

void run().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
