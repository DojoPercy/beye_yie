import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import * as http from 'http';
import * as fs from 'fs';
import { ENTITIES } from '../src/database/entities';
import { DashboardService } from '../src/dashboard/dashboard.service';
config();
(async () => {
  const ds = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL, entities: ENTITIES, synchronize: false, ssl: { rejectUnauthorized: false } });
  await ds.initialize();
  const svc = new DashboardService(
    ds.getRepository('Worker') as any, ds.getRepository('PainEvent') as any,
    ds.getRepository('CheckIn') as any, ds.getRepository('RedFlagReferral') as any,
    ds.getRepository('TipDelivery') as any, ds.getRepository('Assessment') as any,
    ds.getRepository('DailyCheckIn') as any, ds.getRepository('FunctionScore') as any,
  );
  http.createServer(async (req, res) => {
    try {
      if (req.url?.startsWith('/dashboard/summary')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify(await svc.summary()));
      }
      if (req.url?.startsWith('/dashboard/outreach')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify(await svc.outreach()));
      }
      const light = req.url?.startsWith('/light');
      let html = fs.readFileSync('public/impact.html', 'utf8');
      if (light) html = html.replace('<html lang="en">', '<html lang="en" data-theme="light">');
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(html);
    } catch (e: any) {
      res.writeHead(500); res.end(e.message);
    }
  }).listen(4602, () => console.log('preview on 4602'));
})();
