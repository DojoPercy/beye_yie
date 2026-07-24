# Abena AI Text-to-Speech Integration

This integration can convert reviewed Bɛyɛ Yie Ghana scripts into audio using Ghanaian-accent voices via Abena AI's TTS API.

The production welcome flow does **not** synthesize a clip for each worker. It
sends a configured, pre-rendered Twi or English clip after the worker chooses a
language. This keeps onboarding fast, avoids per-worker provider costs, and
prevents personalized health text from becoming a stored public audio file.

## Features

- **Free Tier**: 50 requests without API key, no sign-up required
- **Ghanaian Voices**: Native Twi and Ghanaian-accented English voices
- **Deterministic local cache**: Reviewed scripts produce a content-addressed OGG file, so a persisted development volume can reuse it after a restart
- **Meta media IDs**: Send a pre-uploaded asset repeatedly without asking Meta to fetch a public URL

## Available Voices

| Voice ID | Name | Language | Country | Gender |
|----------|------|----------|---------|--------|
| `abena_twi_high` | Abena High | Twi (Akan) | Ghana | Female |
| `abena_twi_lite` | Abena Lite | Twi (Akan) | Ghana | Female |
| `kobby_gpe` | Kobby | Ghanaian Pidgin English | Ghana | Male |
| `akua_eng` | Akua | English (Ghanaian accent) | Ghana | Female |
| `kwabena_eng` | Kwabena | English (Ghanaian accent) | Ghana | Male |

## Configuration

Add the following to your `.env` file:

```bash
# Enable TTS
ABENA_TTS_ENABLED=true

# Optional: Add API key for higher limits (get from https://abena.mobobi.com)
ABENA_TTS_API_KEY=your_api_key_here

# Default voice (optional, defaults to abena_twi_high)
ABENA_TTS_DEFAULT_VOICE=abena_twi_high
```

## Production welcome audio

Prepare and review exactly two short clips: one Twi and one English. Upload
each OGG/Opus file to WhatsApp Cloud API, then configure the returned media
IDs. A media ID is preferred over a public URL.

```bash
WELCOME_AUDIO_TW_MEDIA_ID=<meta-media-id>
WELCOME_AUDIO_EN_MEDIA_ID=<meta-media-id>
```

For a development or staging deployment only, an HTTPS link may be configured
instead:

```bash
WELCOME_AUDIO_TW_URL=https://cdn.example.com/beye-yie/welcome-v1-tw.ogg
WELCOME_AUDIO_EN_URL=https://cdn.example.com/beye-yie/welcome-v1-en.ogg
```

Set only one source per language. With neither source configured, onboarding
remains fully usable and sends the complete text scope before the name prompt.

The welcome messages must be fixed, reviewed content. Do not use a worker's
name, pain report, or agent reply in a reusable audio asset.

## Usage

### One-time, reviewed asset creation

```typescript
import { AbenaTTSService } from './whatsapp/abena-tts.service';

constructor(private readonly tts: AbenaTTSService) {}

async createReviewedAsset(text: string, language: 'en' | 'tw') {
  const voice = this.tts.getVoiceForLanguage(language);
  const result = await this.tts.synthesize(text, voice);
  // result.absoluteUrl is the HTTPS URL, result.url is its local path.
  return result;
}
```

The generator is deliberately **not** connected to grounded, red-flag, or
on-demand replies. Personalized health conversations must stay text-only until
a privacy-reviewed audio design exists.

### Generate from the command line

After a native speaker and OT approve a script, put it in an environment
variable for the one-time generation command. Do not put the script in command
line arguments or use it for personalized content.

```bash
ABENA_TTS_ENABLED=true \
PUBLIC_BASE_URL=https://audio.example.com \
WELCOME_AUDIO_EN_TEXT='Reviewed English welcome script' \
npm run generate:welcome-audio -- en
```

The command prints the deterministic OGG path. Upload that file with Meta's
media endpoint, then copy the returned ID into `WELCOME_AUDIO_EN_MEDIA_ID` or
`WELCOME_AUDIO_TW_MEDIA_ID`.

## API Details

### Endpoint
```
POST https://abena.mobobi.com/playground/api/v1/tts/synthesize/
```

### Request Body
```json
{
  "text": "Hello! Welcome to Abena AI.",
  "voice": "akua_eng",
  "speed": 1.0
}
```

### Response
```json
{
  "status": "success",
  "voice": "abena_twi_high",
  "audio_base64": "UklGRiQ...",
  "duration_seconds": 2.91,
  "mime_type": "audio/wav",
  "quality": "high"
}
```

## Limitations

- **Text Length**: Maximum 500 characters per request (automatically truncated)
- **First Request**: First request to a voice may take 10-15 seconds (model loading)
- **Subsequent Requests**: ~1 second after voice is loaded
- **Free Tier**: 50 requests without API key

## Audio File Storage

- Audio files are saved to `public/audio/` directory
- Files use a deterministic SHA-256 name: `tts_<content-hash>.ogg`
- They are served at `/audio/filename.ogg` when `PUBLIC_BASE_URL` is set
- Local files are suitable for development or a mounted persistent volume only;
  use immutable object storage and/or a Meta media ID in production

## Voice Selection by Language

The service provides a helper method to select voices based on worker language:

```typescript
// Twi → abena_twi_high
const voice = this.tts.getVoiceForLanguage('tw');

// English → akua_eng
const voice = this.tts.getVoiceForLanguage('en');
```

## Error Handling

The service handles errors gracefully:
- Returns `null` on failure
- Logs errors with detailed messages
- Never throws exceptions (best-effort approach)
- Can be safely used in pipeline without breaking text-only fallback

## Testing

To test the integration:

```bash
# Enable TTS in .env
ABENA_TTS_ENABLED=true

# Start the dev server
npm run start:dev

# Send a test message through the bot
# Check logs for TTS generation
# Verify audio files appear in public/audio/
```

## Production Considerations

1. **API Key**: Get an API key from Abena AI for higher limits and usage dashboard
2. **Asset review**: Native-speaker and OT approval is mandatory before generating the Twi clip
3. **Storage**: Keep the source OGG in immutable object storage; Meta media IDs are an optimized delivery reference, not the sole source of truth
4. **Fallback**: Always have text-only onboarding when an audio asset is unavailable
5. **Privacy**: Cache only fixed, reviewed content. Do not create durable public audio for individual health conversations

## Troubleshooting

### TTS not generating audio
- Check `ABENA_TTS_ENABLED=true` in environment
- Verify network connectivity to `abena.mobobi.com`
- Check logs for error messages
- Ensure text is not empty

### Audio files not accessible
- Verify `public/audio/` directory exists
- Check static file serving is enabled in `main.ts`
- Ensure audio file URLs are properly constructed with base URL

### First request is slow
- This is normal - voice model loading takes 10-15 seconds
- Subsequent requests will be faster (~1 second)
