import { ConfigService } from '@nestjs/config';
import { OnboardingService } from '../src/agent/onboarding/onboarding.service';
import { AppConfig } from '../src/config/configuration';
import { Worker } from '../src/database/entities/worker.entity';

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean): void {
  if (condition) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}`);
  }
}

function worker(step: string): Worker {
  return {
    userId: '233201234567',
    name: null,
    language: 'en',
    category: null,
    workActivity: null,
    tipTime: '06:30',
    frequency: 'daily',
    onboardingStep: step,
    onboarded: false,
    lastVerifiedInboundAt: null,
    tipCursor: 0,
    lastTipDate: null,
    signupDate: new Date(),
    updatedAt: new Date(),
  };
}

const workers = { save: async <T>(value: T): Promise<T> => value };
const config = new ConfigService<AppConfig>({
  welcomeAudio: {
    tw: { mediaId: 'tw-welcome-media-id' },
    en: { link: 'https://cdn.example.com/welcome-en.ogg' },
  },
} as AppConfig);
const onboarding = new OnboardingService(workers as any, config);

async function verify(): Promise<void> {
  console.log('\n[1] Pre-rendered welcome audio:');
  const twWorker = worker('language');
  const twMessages = await onboarding.handle(twWorker, {
    phone: twWorker.userId,
    messageId: 'wamid.tw',
    text: '',
    replyId: 'lang_tw',
  });
  check('sends the configured Twi Meta media ID first', twMessages[0]?.type === 'audio' && 'mediaId' in twMessages[0] && twMessages[0].mediaId === 'tw-welcome-media-id');
  check('asks for a name after the Twi clip', twMessages[1]?.type === 'text' && twMessages[1].body.includes('Yɛmfrɛ wo sɛn'));

  const enWorker = worker('language');
  const enMessages = await onboarding.handle(enWorker, {
    phone: enWorker.userId,
    messageId: 'wamid.en',
    text: '',
    replyId: 'lang_en',
  });
  check('uses an HTTPS link when no English media ID is configured', enMessages[0]?.type === 'audio' && 'link' in enMessages[0] && enMessages[0].link === 'https://cdn.example.com/welcome-en.ogg');

  console.log('\n[2] Text-only fallback:');
  const fallbackConfig = new ConfigService<AppConfig>({ welcomeAudio: {} } as AppConfig);
  const textOnly = new OnboardingService(workers as any, fallbackConfig);
  const fallbackWorker = worker('language');
  const fallbackMessages = await textOnly.handle(fallbackWorker, {
    phone: fallbackWorker.userId,
    messageId: 'wamid.fallback',
    text: '',
    replyId: 'lang_en',
  });
  check('does not send an audio message without an asset', fallbackMessages.length === 1 && fallbackMessages[0]?.type === 'text');
  check('keeps the medical scope in the text fallback', fallbackMessages[0]?.type === 'text' && fallbackMessages[0].body.includes('not medical treatment'));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

void verify();
