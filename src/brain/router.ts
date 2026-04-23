import { createProvider, getDefaultTextProvider, getProviderConfig } from '../models/providers.js';
import type { ProviderConfig } from '../config/schema.js';
import type { TaskType } from '../models/types.js';
import { getConfig } from '../config/loader.js';
import { getLogger } from '../utils/logger.js';

// ═══════════════════════════════════════════
// Model Router — selects model by task type
// with fallback chain support
// ═══════════════════════════════════════════

const logger = getLogger('router');

/** Priority order for text providers (nvidia first = most stable free) */
const TEXT_PROVIDER_PRIORITY = ['nvidia', 'openrouter', 'gemini', 'codex', 'ollama'];
// NOTE: 'huggingface' is intentionally excluded — it only supports image generation

/**
 * Create a LanguageModel from a provider instance + model ID.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getModel(providerConfig: ProviderConfig, fallbackModel: string): any {
  const sdk = createProvider(providerConfig);
  const modelId = providerConfig.defaultModel ?? fallbackModel;

  if (typeof sdk === 'function') {
    return sdk(modelId);
  }
  if (sdk && typeof sdk === 'object' && 'chatModel' in sdk) {
    return (sdk as { chatModel: (id: string) => unknown }).chatModel(modelId);
  }
  return (sdk as unknown as (id: string) => unknown)(modelId);
}

/**
 * Get ALL available text models ordered by priority.
 * Used by cortex for fallback: if first fails, try next.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAllTextModels(): Array<{ model: any; providerType: string; modelId: string }> {
  const config = getConfig();
  const results: Array<{ model: unknown; providerType: string; modelId: string }> = [];

  for (const type of TEXT_PROVIDER_PRIORITY) {
    const provider = config.providers.find(p => p.type === type && p.enabled);
    if (provider) {
      try {
        const fallback = type === 'nvidia' ? 'meta/llama-3.1-70b-instruct'
          : type === 'ollama' ? 'llama3.1'
          : type === 'codex' ? 'gpt-4o'
          : 'meta-llama/llama-3.1-70b-instruct';
        const model = getModel(provider, fallback);
        const modelId = provider.defaultModel ?? fallback;
        results.push({ model, providerType: type, modelId });
      } catch (err) {
        logger.warn({ provider: type, error: err instanceof Error ? err.message : String(err) }, 'provider init failed, skipping');
      }
    }
  }

  return results;
}

/**
 * Select the first available model for a given task type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function selectModel(task: TaskType): any {
  switch (task) {
    case 'text': {
      const provider = getDefaultTextProvider();
      const modelId = provider.defaultModel ?? 'meta/llama-3.1-70b-instruct';
      logger.debug({ provider: provider.type, model: modelId }, 'selected text model');
      return getModel(provider, 'meta/llama-3.1-70b-instruct');
    }

    case 'fast': {
      const ollama = getProviderConfig('ollama');
      if (ollama) {
        return getModel(ollama, 'llama3.1');
      }
      return selectModel('text');
    }

    case 'code': {
      const codex = getProviderConfig('codex');
      if (codex) {
        return getModel(codex, 'gpt-4o');
      }
      return selectModel('text');
    }

    case 'embed':
      throw new Error('Use embedText() from memory/embeddings.ts for embeddings');

    case 'image':
      throw new Error('Use ImageGenTool for image generation');

    default:
      return selectModel('text');
  }
}
