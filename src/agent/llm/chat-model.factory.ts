import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { AppConfig } from '../../config/configuration';

export type ChatModel = ChatOpenAI | ChatGoogleGenerativeAI;

interface Options {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

// A generous per-request timeout. On small hosts an un-timed-out request can
// stall; a real timeout throws cleanly (→ safe fallback) instead of returning
// a half-generated, truncated reply.
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Builds a LangChain chat model from typed app config. Multi-provider, like
 * washam-ai's factory: OPENAI | OPENROUTER | GOOGLE.
 */
export function createChatModel(cfg: AppConfig['llm'], options: Options = {}): ChatModel {
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  switch (cfg.provider) {
    case 'OPENROUTER':
      return new ChatOpenAI({
        model: cfg.openrouterModel,
        apiKey: cfg.openrouterKey,
        configuration: { baseURL: 'https://openrouter.ai/api/v1' },
        temperature: options.temperature ?? 0.3,
        maxTokens: options.maxTokens,
        // Wait for the whole completion, don't emit/aggregate a partial stream.
        streaming: false,
        timeout,
        maxRetries: 2,
      });
    case 'GOOGLE':
      return new ChatGoogleGenerativeAI({
        model: cfg.geminiModel,
        apiKey: cfg.googleKey,
        temperature: options.temperature ?? 0.3,
        maxOutputTokens: options.maxTokens,
        streaming: false,
        maxRetries: 2,
      });
    case 'OPENAI':
    default:
      return new ChatOpenAI({
        model: cfg.openaiModel,
        apiKey: cfg.openaiKey,
        temperature: options.temperature ?? 0.3,
        maxTokens: options.maxTokens,
        streaming: false,
        timeout,
        maxRetries: 2,
      });
  }
}

/** True when a usable API key is configured for the selected provider. */
export function llmConfigured(cfg: AppConfig['llm']): boolean {
  switch (cfg.provider) {
    case 'OPENROUTER':
      return !!cfg.openrouterKey;
    case 'GOOGLE':
      return !!cfg.googleKey;
    default:
      return !!cfg.openaiKey;
  }
}
