/**
 * Central typed configuration. Everything the service needs is read from env
 * once here so the rest of the code depends on names, not process.env strings.
 */
export interface AppConfig {
  port: number;
  databaseUrl: string;
  llm: {
    provider: 'OPENAI' | 'OPENROUTER' | 'GOOGLE';
    openaiKey?: string;
    openaiModel: string;
    googleKey?: string;
    geminiModel: string;
    openrouterKey?: string;
    openrouterModel: string;
  };
  whatsapp: {
    token?: string;
    phoneNumberId?: string;
    appSecret?: string;
    verifyToken: string;
    sendTimeoutMs: number;
  };
  voice: {
    enabled: boolean;
    provider: 'openai' | 'groq';
    groqKey?: string;
  };
  abenaTts: {
    enabled: boolean;
    apiKey?: string;
    defaultVoice: string;
    publicBaseUrl?: string;
  };
  /**
   * Immutable, pre-rendered onboarding clips. Prefer Meta media IDs: the
   * welcome flow then has no TTS call, public URL, or per-worker cost.
   */
  welcomeAudio: {
    en?: { mediaId?: string; link?: string };
    tw?: { mediaId?: string; link?: string };
  };
  /** Approved Meta templates that offer a generated voice version of a tip. */
  tipVoiceOfferTemplate: {
    en?: string;
    tw?: string;
  };
  handoff: {
    name: string;
    contact: string;
  };
  scheduler: {
    tickMinutes: number;
    /** Layer ① daily-tip push. Off until Meta approves the utility templates. */
    tipsEnabled: boolean;
    /** Weekly proactive check-in. Also template-gated. */
    checkInsEnabled: boolean;
  };
}

export default (): AppConfig => ({
  port: Number(process.env.PORT || 3005),
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/beye_yie',
  llm: {
    provider: (process.env.LLM_PROVIDER || 'OPENAI').toUpperCase() as AppConfig['llm']['provider'],
    openaiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    googleKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    openrouterKey: process.env.OPENROUTER_API_KEY,
    openrouterModel: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
  },
  whatsapp: {
    token: process.env.META_WHATSAPP_TOKEN,
    phoneNumberId: process.env.META_PHONE_NUMBER_ID,
    appSecret: process.env.META_APP_SECRET,
    verifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || 'beye-yie-verify',
    sendTimeoutMs: Number(process.env.WHATSAPP_SEND_TIMEOUT_MS || 8000),
  },
  voice: {
    enabled: process.env.VOICE_NOTE_TRANSCRIPTION_ENABLED === 'true',
    provider:
      (process.env.VOICE_NOTE_TRANSCRIPTION_PROVIDER || 'openai').toLowerCase() === 'groq'
        ? 'groq'
        : 'openai',
    groqKey: process.env.GROQ_API_KEY,
  },
  abenaTts: {
    enabled: process.env.ABENA_TTS_ENABLED === 'true',
    apiKey: process.env.ABENA_TTS_API_KEY,
    defaultVoice: process.env.ABENA_TTS_DEFAULT_VOICE || 'abena_twi_high',
    publicBaseUrl: process.env.PUBLIC_BASE_URL,
  },
  welcomeAudio: {
    en: {
      mediaId: process.env.WELCOME_AUDIO_EN_MEDIA_ID,
      link: process.env.WELCOME_AUDIO_EN_URL,
    },
    tw: {
      mediaId: process.env.WELCOME_AUDIO_TW_MEDIA_ID,
      link: process.env.WELCOME_AUDIO_TW_URL,
    },
  },
  tipVoiceOfferTemplate: {
    en: process.env.TIP_VOICE_OFFER_TEMPLATE_EN,
    tw: process.env.TIP_VOICE_OFFER_TEMPLATE_TW,
  },
  handoff: {
    name: process.env.OT_HANDOFF_NAME || 'Ghana Health Service',
    contact: process.env.OT_HANDOFF_CONTACT || '+233-000-000-000',
  },
  scheduler: {
    tickMinutes: Number(process.env.TIP_SCHEDULER_TICK_MINUTES || 5),
    // Default OFF: proactive messages need approved WhatsApp templates.
    tipsEnabled: process.env.TIP_SCHEDULER_ENABLED === 'true',
    checkInsEnabled: process.env.WEEKLY_CHECKIN_ENABLED === 'true',
  },
});
