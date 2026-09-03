/**
 * Manual daily-tip trigger — sends one worker her tip now, ignoring the time
 * she chose, her frequency setting, and whether she already had one today.
 *
 * It calls the real TipSchedulerService.sendDailyTip, so what goes out is
 * exactly what the 06:30 sweep would send: same tip selection, same template
 * or button fallback, same delivery logging.
 *
 * The two gates it does NOT bypass, because they are not scheduling rules:
 *   • onboarded            — an unfinished registration has no tip to send
 *   • lastVerifiedInboundAt — Meta-verified inbound consent for this exact
 *                             WhatsApp ID; sending without it is the one thing
 *                             the scheduler treats as a hard error.
 *
 *   npm run tip:test -- --to=233XXXXXXXXX           # dry run, prints payload
 *   npm run tip:test -- --to=233XXXXXXXXX --send    # actually delivers
 *   npm run tip:test -- --all                       # every eligible worker
 */
import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import configuration, { AppConfig } from '../src/config/configuration';
import { ENTITIES } from '../src/database/entities';
import { PersonalizationService } from '../src/agent/personalization/personalization.service';
import { TipVoiceOfferService } from '../src/agent/tips/tip-voice-offer.service';
import { WorkerService } from '../src/agent/worker/worker.service';
import { WhatsAppService } from '../src/whatsapp/whatsapp.service';
import { WhatsAppOutbound } from '../src/whatsapp/whatsapp.types';
import { TipSchedulerService } from '../src/scheduler/tip-scheduler.service';

loadEnv();

const args = process.argv.slice(2);
const to = args.find((a) => a.startsWith('--to='))?.slice(5);
const live = args.includes('--send');
const all = args.includes('--all');

async function main(): Promise<void> {
  if (!to && !all) {
    console.error('Usage: npm run tip:test -- (--to=233XXXXXXXXX | --all) [--send]');
    process.exit(1);
  }

  const ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: ENTITIES,
    synchronize: false,
    ssl: { rejectUnauthorized: false },
  });
  await ds.initialize();

  const cfg = new ConfigService<AppConfig>(configuration() as AppConfig);
  // WhatsAppService and TipSchedulerService take an untyped ConfigService.
  const plainCfg = cfg as unknown as ConfigService;
  const workers = new WorkerService(ds.getRepository('Worker') as any);
  const personalization = new PersonalizationService(
    ds.getRepository('PainEvent') as any,
    ds.getRepository('CheckIn') as any,
    ds.getRepository('TipDelivery') as any,
    ds.getRepository('Tip') as any,
  );
  const offers = new TipVoiceOfferService(ds.getRepository('Tip') as any, cfg);
  const whatsapp = new WhatsAppService(plainCfg);

  if (!live) {
    // Returning false is how a failed send already behaves: the scheduler logs
    // it and leaves lastTipDate, the cursor and the delivery log untouched.
    (whatsapp as any).sendMany = async (userId: string, messages: WhatsAppOutbound[]) => {
      console.log(`\nDRY RUN — would send to ${userId}:\n`);
      console.log(JSON.stringify(messages, null, 2));
      return false;
    };
  }

  const scheduler = new TipSchedulerService(plainCfg, workers, personalization, whatsapp, offers);

  // Same eligibility the sweep applies, minus every scheduling rule.
  const candidates = all ? await workers.all() : [await workers.find(to!)];
  const targets: NonNullable<Awaited<ReturnType<typeof workers.find>>>[] = [];

  for (const worker of candidates) {
    if (!worker) {
      console.error(`No worker row for ${to}. She has never messaged this bot.`);
      process.exit(1);
    }
    if (!worker.onboarded) {
      const msg = `${worker.userId}: skipped — onboarding unfinished (step: ${worker.onboardingStep ?? 'none'})`;
      if (!all) { console.error(msg); process.exit(1); }
      console.log(msg);
      continue;
    }
    if (!worker.lastVerifiedInboundAt) {
      const msg = `${worker.userId}: skipped — no verified inbound consent`;
      if (!all) { console.error(msg); process.exit(1); }
      console.log(msg);
      continue;
    }
    targets.push(worker);
  }

  if (!targets.length) {
    console.error('\nNo eligible recipients.');
    await ds.destroy();
    process.exit(1);
  }

  // WhatsAppService falls back to demo mode when Meta credentials are absent:
  // it logs the payload and reports success, which would make the scheduler
  // record a delivery that never happened. Never let --send run into that.
  if (live && !(cfg.get('whatsapp', { infer: true })?.token && cfg.get('whatsapp', { infer: true })?.phoneNumberId)) {
    console.error(
      '\nREFUSING TO SEND: META_WHATSAPP_TOKEN / META_PHONE_NUMBER_ID are not set in this environment.\n' +
      'The WhatsApp client would run in demo mode — logging the payload, returning success, and\n' +
      'writing a delivery record for a message nobody receives. Run this where the Meta secrets\n' +
      'exist (the Render shell), or drop --send for a dry run.',
    );
    await ds.destroy();
    process.exit(1);
  }

  const templates = cfg.get('tipVoiceOfferTemplate', { infer: true });
  const today = new Date().toISOString().slice(0, 10);

  for (const worker of targets) {
    const hasTemplate = Boolean(templates?.[worker.language]);
    console.log(`\n──────────────────────────────────────────────`);
    console.log(`Worker      : ${worker.name ?? '(no name)'} <${worker.userId}>`);
    console.log(`Language    : ${worker.language}   Category: ${worker.category ?? 'load (default)'}`);
    console.log(`Last tip    : ${worker.lastTipDate ?? 'never'}   Their tip time: ${worker.tipTime} (ignored)`);
    console.log(`Path        : ${hasTemplate ? `template "${templates?.[worker.language]}"` : 'text + audio — needs an open 24h window'}`);
    await scheduler.sendDailyTip(worker, today);
  }

  console.log(live ? '\nSent.' : '\nDry run complete — nothing was sent, no state changed.');
  await ds.destroy();
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
