import { Body, Controller, Get, Headers, HttpCode, Logger, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { PgBossService } from '../messaging/pg-boss.service';
import { INBOUND_QUEUE } from '../messaging/queues';
import { WhatsAppService } from './whatsapp.service';

/**
 * Meta webhook endpoint.
 *  GET  /webhook  → subscription verification handshake.
 *  POST /webhook  → normalize + enqueue inbound messages (ack fast, process async).
 */
@Controller('webhook')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly whatsapp: WhatsAppService,
    private readonly boss: PgBossService,
  ) {}

  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const expected = this.config.get<string>('whatsapp.verifyToken');
    if (mode === 'subscribe' && token === expected) {
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  }

  @Post()
  @HttpCode(200)
  async receive(
    @Body() body: any,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Req() request: Request & { rawBody?: Buffer },
  ): Promise<{ ok: true }> {
    if (!this.whatsapp.isWebhookSignatureValid(request.rawBody, signature)) {
      this.logger.warn('rejected webhook with an invalid Meta signature');
      throw new UnauthorizedException();
    }
    for (const inbound of this.whatsapp.normalizeInbounds(body)) {
      if (!this.whatsapp.isInboundForConfiguredNumber(inbound)) {
        this.logger.warn('ignored webhook event for a different WhatsApp business number');
        continue;
      }
      this.logger.debug(`inbound from ${inbound.phone}: "${inbound.text || inbound.replyId || '[audio]'}"`);
      await this.boss.send(INBOUND_QUEUE, inbound);
    }
    // Always 200 quickly so Meta does not retry.
    return { ok: true };
  }
}
