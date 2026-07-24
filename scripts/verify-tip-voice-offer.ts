import { ConfigService } from '@nestjs/config';
import { TipVoiceOfferService, parseTipVoiceReplyId } from '../src/agent/tips/tip-voice-offer.service';
import { AppConfig } from '../src/config/configuration';
import { Tip } from '../src/database/entities/tip.entity';
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

const tip = {
  id: 'L1',
  category: 'load',
  seq: 1,
  focus: 'Lifting',
  textEn: 'Bend your knees, not your waist, when you lift.',
  textTw: 'Bɛn wo kotodwe mu, ɛnyɛ wo sisi.',
  audioEnUrl: null,
  audioTwUrl: null,
  audioEnMediaId: null,
  audioTwMediaId: null,
  templateName: null,
} as Tip;
const worker = { userId: '233201234567', name: 'Ama', language: 'en', category: 'load' } as Worker;
const repo = {
  findOne: async () => tip,
} as any;
const config = new ConfigService<AppConfig>({
  tipVoiceOfferTemplate: { en: 'daily_prevention_tip_voice_offer_en' },
} as AppConfig);
const offers = new TipVoiceOfferService(repo, config);

console.log('\n[1] Approved voice-offer template:');
const template = offers.buildOffer(worker, tip)[0];
check('uses the configured Meta utility template', template?.type === 'template' && template.name === 'daily_prevention_tip_voice_offer_en');
check('passes the worker name and exact tip text to the body', template?.type === 'template' && template.bodyParams?.[0] === 'Ama' && template.bodyParams?.[1] === tip.textEn);
check('assigns a payload to the Play button', template?.type === 'template' && template.quickReplyPayloads?.[0] === 'tip_voice_play:L1:en');
check('parses the Play payload safely', parseTipVoiceReplyId('tip_voice_play:L1:en')?.kind === 'play');

console.log('\n[2] Active-conversation fallback:');
const noTemplate = new TipVoiceOfferService(repo, new ConfigService<AppConfig>({ tipVoiceOfferTemplate: {} } as AppConfig));
const buttons = noTemplate.buildOffer(worker, tip)[0];
check('uses interactive buttons before the template is approved', buttons?.type === 'buttons');
check('includes a No thanks action', buttons?.type === 'buttons' && buttons.buttons[1]?.id === 'tip_voice_skip:L1:en');

console.log(`\nRESULT: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
