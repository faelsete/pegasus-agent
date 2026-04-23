import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { getConfig } from '../config/loader.js';
import type { ProviderConfig } from '../config/schema.js';
import { getLogger } from '../utils/logger.js';

// ═══════════════════════════════════════════
// AI SDK Provider Instances
// ═══════════════════════════════════════════

const logger = getLogger('providers');

/** Create AI SDK provider from config */
export function createProvider(providerConfig: ProviderConfig) {
  switch (providerConfig.type) {
    case 'nvidia':
      return createOpenAI({
        apiKey: providerConfig.apiKey ?? '',
        baseURL: providerConfig.baseUrl ?? 'https://integrate.api.nvidia.com/v1',
      });

    case 'openrouter':
      return createOpenAI({
        apiKey: providerConfig.apiKey ?? '',
        baseURL: 'https://openrouter.ai/api/v1',
      });

    case 'gemini':
      return createGoogleGenerativeAI({
        apiKey: providerConfig.apiKey ?? '',
      });

    case 'codex':
      return createOpenAI({
        apiKey: providerConfig.apiKey ?? '',
      });

    case 'ollama':
      return createOpenAI({
        apiKey: 'ollama', // not needed but required by SDK
        baseURL: providerConfig.baseUrl ?? 'http://localhost:11434/v1',
      });

    default:
      throw new Error(`Unknown provider type: ${providerConfig.type}`);
  }
}

/** Get provider config by type */
export function getProviderConfig(type: string): ProviderConfig | undefined {
  const config = getConfig();
  return config.providers.find(p => p.type === type && p.enabled);
}

/** Get the first available text provider */
export function getDefaultTextProvider(): ProviderConfig {
  const config = getConfig();
  const textProviders = ['nvidia', 'openrouter', 'gemini', 'codex', 'ollama'];
  const provider = config.providers.find(p => textProviders.includes(p.type) && p.enabled);
  if (!provider) {
    throw new Error('No text provider configured. Run: npm run setup');
  }
  return provider;
}
