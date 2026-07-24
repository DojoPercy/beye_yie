import { ConfigService } from '@nestjs/config';
import configuration, { AppConfig } from '../src/config/configuration';
import { AbenaTTSService } from '../src/whatsapp/abena-tts.service';

const language = process.argv[2];

if (language !== 'en' && language !== 'tw') {
  console.error('Usage: npm run generate:welcome-audio -- <en|tw>');
  process.exit(1);
}

const textKey = language === 'en' ? 'WELCOME_AUDIO_EN_TEXT' : 'WELCOME_AUDIO_TW_TEXT';
const text = process.env[textKey]?.trim();
if (!text) {
  console.error(`${textKey} is required. Use only a native-speaker and OT-reviewed fixed welcome script.`);
  process.exit(1);
}

const appConfig = configuration();
if (!appConfig.abenaTts.enabled) {
  console.error('Set ABENA_TTS_ENABLED=true to generate a welcome asset. The running onboarding flow does not require it.');
  process.exit(1);
}

const config = new ConfigService<AppConfig>(appConfig as any);
const tts = new AbenaTTSService(config);

void tts.synthesize(text, tts.getVoiceForLanguage(language)).then((result) => {
  if (!result) {
    console.error('Welcome audio was not generated. Check Abena credentials, network access, and ffmpeg.');
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
  console.log('\nUpload this OGG/Opus asset to Meta, then set the matching WELCOME_AUDIO_*_MEDIA_ID.');
});
