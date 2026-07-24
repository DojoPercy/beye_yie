import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { join } from 'path';

async function bootstrap() {
  // Preserve Meta's exact payload bytes for X-Hub-Signature-256 verification.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // Enable static file serving for audio files
  app.useStaticAssets(join(process.cwd(), 'public'));

  app.enableShutdownHooks();
  const port = Number(process.env.PORT || 3005);
  await app.listen(port);
  new Logger('Bootstrap').log(`Bɛyɛ Yie Ghana listening on :${port}`);
}

bootstrap();
