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
 * Expand a single provider config into multiple if it has apiKeys array.
 * Each key becomes its own entry in the fallback chain.
 */
function expandProviderKeys(provider: ProviderConfig): ProviderConfig[] {
  const keys = provider.apiKeys;
  if (keys && keys.length > 0) {
    return keys.map((key, i) => {
      logger.debug({ type: provider.type, keyIndex: i + 1, total: keys.length }, 'expanding multi-key provider');
      return { ...provider, apiKey: key, apiKeys: undefined };
    });
  }
  return [provider];
}

/**
 * Get ALL available text models ordered by priority.
 * Supports multiple providers of the same type AND multiple keys per provider.
 * Used by cortex for fallback: if first fails, try next.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAllTextModels(): Array<{ model: any; providerType: string; modelId: string }> {
  const config = getConfig();
  const results: Array<{ model: unknown; providerType: string; modelId: string }> = [];

  for (const type of TEXT_PROVIDER_PRIORITY) {
    // Find ALL providers of this type (not just the first one)
    const providers = config.providers.filter(p => p.type === type && p.enabled);
    for (const provider of providers) {
      // Expand multi-key providers into separate entries
      const expanded = expandProviderKeys(provider);
      for (const singleProvider of expanded) {
        try {
          const fallback = type === 'nvidia' ? 'qwen/qwen3.5-122b-a10b'
            : type === 'ollama' ? 'llama3.1'
            : type === 'codex' ? 'gpt-4o'
            : type === 'gemini' ? 'gemini-2.0-flash'
            : 'google/gemma-3-27b-it:free';
          const model = getModel(singleProvider, fallback);
          const modelId = singleProvider.defaultModel ?? fallback;
          results.push({ model, providerType: type, modelId });
        } catch (err) {
          logger.warn({ provider: type, error: err instanceof Error ? err.message : String(err) }, 'provider init failed, skipping');
        }
      }
    }
  }

  logger.info({ total: results.length, chain: results.map(r => `${r.providerType}`).join('→') }, 'fallback chain built');
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
