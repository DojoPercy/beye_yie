import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { ENTITIES } from '../src/database/entities';
import { DashboardService } from '../src/dashboard/dashboard.service';

config();

async function main() {
  const ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: ENTITIES,
    synchronize: false,
    ssl: { rejectUnauthorized: false },
  });
  await ds.initialize();
  const svc = new DashboardService(
    ds.getRepository('Worker') as any,
    ds.getRepository('PainEvent') as any,
    ds.getRepository('CheckIn') as any,
    ds.getRepository('RedFlagReferral') as any,
    ds.getRepository('TipDelivery') as any,
    ds.getRepository('Assessment') as any,
    ds.getRepository('DailyCheckIn') as any,
    ds.getRepository('FunctionScore') as any,
  );
  const rows = await svc.outreach();
  console.log('OUTREACH ROWS:', rows.length);
  console.log(JSON.stringify(rows, null, 2));
  await ds.destroy();
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
