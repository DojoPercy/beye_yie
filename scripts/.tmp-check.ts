import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { ENTITIES } from '../src/database/entities';
config();
(async () => {
  const ds = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL, entities: ENTITIES, synchronize: false, ssl: { rejectUnauthorized: false } });
  await ds.initialize();
  const w = await ds.query('SELECT "userId", onboarded FROM workers ORDER BY "userId"');
  const r = await ds.query('SELECT "userId", COUNT(*) FILTER (WHERE "callbackRequested" AND NOT "callbackResolved") AS open_cb, COUNT(*) AS total FROM red_flag_referrals GROUP BY "userId" ORDER BY "userId"');
  console.log('WORKERS:', JSON.stringify(w));
  console.log('REFERRALS:', JSON.stringify(r));
  const orphan = await ds.query('SELECT DISTINCT f."userId" FROM red_flag_referrals f LEFT JOIN workers w ON w."userId" = f."userId" WHERE w."userId" IS NULL');
  console.log('REFERRALS WITH NO WORKER ROW:', JSON.stringify(orphan));
  await ds.destroy();
})();
