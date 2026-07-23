import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Meta signs webhook payloads; keep the raw body available if you add
  // signature verification later. JSON body is enough for the demo.
  app.enableShutdownHooks();
  const port = Number(process.env.PORT || 3005);
  await app.listen(port);
  new Logger('Bootstrap').log(`Bɛyɛ Yie Ghana listening on :${port}`);
}

bootstrap();
