import { WhatsAppService, normalizeWhatsAppId } from '../src/whatsapp/whatsapp.service';
import { createHmac } from 'crypto';

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

const configuredPhoneNumberId = '123456789012345';
const appSecret = 'test-app-secret';
const service = new WhatsAppService({
  get<T>(key: string): T | undefined {
    const values: Record<string, unknown> = {
      'whatsapp.phoneNumberId': configuredPhoneNumberId,
      'whatsapp.appSecret': appSecret,
      'whatsapp.sendTimeoutMs': 8000,
    };
    return values[key] as T | undefined;
  },
} as any);

const payload = {
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { phone_number_id: configuredPhoneNumberId },
            contacts: [{ wa_id: '233201234567', profile: { name: 'Ama' } }],
            messages: [{ from: '233201234567', id: 'wamid.expected', type: 'text', text: { body: 'Hello' } }],
          },
        },
        {
          value: {
            metadata: { phone_number_id: '987654321012345' },
            contacts: [{ wa_id: '233501234567', profile: { name: 'Kojo' } }],
            messages: [{ from: '233501234567', id: 'wamid.foreign', type: 'text', text: { body: 'Hello' } }],
          },
        },
      ],
    },
  ],
};

console.log('\n[1] Recipient identity normalization:');
check('canonicalizes a display-formatted WhatsApp ID', normalizeWhatsAppId('+233 20-123-4567') === '233201234567');
check('rejects non-phone input', normalizeWhatsAppId('not-a-number') === null);

console.log('\n[2] Webhook business-number isolation:');
const inbounds = service.normalizeInbounds(payload);
check('normalizes every inbound message in the webhook', inbounds.length === 2);
check('keeps each sender tied to their own WhatsApp ID', inbounds[0]?.phone === '233201234567' && inbounds[1]?.phone === '233501234567');
check('keeps the matching contact name with its sender', inbounds[0]?.profileName === 'Ama' && inbounds[1]?.profileName === 'Kojo');
check('accepts events for this configured business number', service.isInboundForConfiguredNumber(inbounds[0]));
check('rejects events for another business number', !service.isInboundForConfiguredNumber(inbounds[1]));

console.log('\n[3] Audio payloads:');
const metaAudioPayload = (service as any).buildPayload('233201234567', {
  type: 'audio',
  mediaId: 'meta-media-id',
});
const linkedAudioPayload = (service as any).buildPayload('233201234567', {
  type: 'audio',
  link: 'https://cdn.example.com/welcome.ogg',
});
check('uses a Meta media ID for a pre-uploaded audio asset', metaAudioPayload.audio?.id === 'meta-media-id');
check('uses a public link only when no Meta media ID is supplied', linkedAudioPayload.audio?.link === 'https://cdn.example.com/welcome.ogg');

console.log('\n[4] Meta webhook authentication:');
const rawBody = Buffer.from(JSON.stringify(payload));
const signature = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
check('accepts a valid Meta signature', service.isWebhookSignatureValid(rawBody, signature));
check('rejects a tampered signature', !service.isWebhookSignatureValid(rawBody, `${signature}0`));

console.log(`\nRESULT: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
