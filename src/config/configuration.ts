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
    verifyToken: string;
    sendTimeoutMs: number;
  };
  voice: {
    enabled: boolean;
    provider: 'openai' | 'groq';
    groqKey?: string;
  };
  handoff: {
    name: string;
    contact: string;
  };
  scheduler: {
    tickMinutes: number;
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
  handoff: {
    name: process.env.OT_HANDOFF_NAME || 'Ghana Health Service',
    contact: process.env.OT_HANDOFF_CONTACT || '+233-000-000-000',
  },
  scheduler: {
    tickMinutes: Number(process.env.TIP_SCHEDULER_TICK_MINUTES || 5),
  },
});
