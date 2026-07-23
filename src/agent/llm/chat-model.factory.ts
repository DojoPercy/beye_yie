import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { AppConfig } from '../../config/configuration';

export type ChatModel = ChatOpenAI | ChatGoogleGenerativeAI;

interface Options {
  temperature?: number;
  maxTokens?: number;
}

/**
 * Builds a LangChain chat model from typed app config. Multi-provider, like
 * washam-ai's factory: OPENAI | OPENROUTER | GOOGLE.
 */
export function createChatModel(cfg: AppConfig['llm'], options: Options = {}): ChatModel {
  switch (cfg.provider) {
    case 'OPENROUTER':
      return new ChatOpenAI({
        model: cfg.openrouterModel,
        apiKey: cfg.openrouterKey,
        configuration: { baseURL: 'https://openrouter.ai/api/v1' },
        temperature: options.temperature ?? 0.3,
        maxTokens: options.maxTokens,
      });
    case 'GOOGLE':
      return new ChatGoogleGenerativeAI({
        model: cfg.geminiModel,
        apiKey: cfg.googleKey,
        temperature: options.temperature ?? 0.3,
        maxOutputTokens: options.maxTokens,
      });
    case 'OPENAI':
    default:
      return new ChatOpenAI({
        model: cfg.openaiModel,
        apiKey: cfg.openaiKey,
        temperature: options.temperature ?? 0.3,
        maxTokens: options.maxTokens,
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
