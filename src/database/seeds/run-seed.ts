import AppDataSource from '../data-source';
import { Tip } from '../entities/tip.entity';
import { SEED_TIPS } from './tips.data';

/** Idempotently upsert the 9 vetted tips. Run: npm run seed:tips */
async function run() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(Tip);

  for (const t of SEED_TIPS) {
    await repo.save(
      repo.create({
        id: t.id,
        category: t.category,
        seq: t.seq,
        focus: t.focus,
        textEn: t.textEn,
        textTw: t.textTw,
        audioEnUrl: t.audioEnUrl,
        audioTwUrl: t.audioTwUrl,
        templateName: null,
      }),
    );
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded ${SEED_TIPS.length} tips.`);
  await AppDataSource.destroy();
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
