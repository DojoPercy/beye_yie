import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // Preserve Meta's exact payload bytes for X-Hub-Signature-256 verification.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT || 3005);
  await app.listen(port);
  new Logger('Bootstrap').log(`Bɛyɛ Yie Ghana listening on :${port}`);
}

bootstrap();
