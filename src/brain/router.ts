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
 * Pick one API key from a provider using round-robin rotation.
 * Avoids creating duplicate fallback entries for the same model.
 */
const keyIndex = new Map<string, number>();

function pickKeyForProvider(provider: ProviderConfig): ProviderConfig {
  const keys = provider.apiKeys;
  if (!keys || keys.length === 0) return provider;

  const provKey = `${provider.type}-${provider.defaultModel ?? 'default'}`;
  const idx = keyIndex.get(provKey) ?? 0;
  keyIndex.set(provKey, (idx + 1) % keys.length);

  logger.debug({ type: provider.type, keyIndex: idx + 1, total: keys.length }, 'rotating key');
  return { ...provider, apiKey: keys[idx], apiKeys: undefined };
}

/**
 * Get ALL available text models ordered by priority.
 * One entry per unique provider+model combo (no duplicates).
 * Multiple keys for the same provider use round-robin rotation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAllTextModels(): Array<{ model: any; providerType: string; modelId: string }> {
  const config = getConfig();
  const results: Array<{ model: unknown; providerType: string; modelId: string }> = [];
  const seen = new Set<string>();

  for (const type of TEXT_PROVIDER_PRIORITY) {
    const providers = config.providers.filter(p => p.type === type && p.enabled);
    for (const provider of providers) {
      const resolved = pickKeyForProvider(provider);
      const fallback = type === 'nvidia' ? 'qwen/qwen3.5-122b-a10b'
        : type === 'ollama' ? 'llama3.1'
        : type === 'codex' ? 'gpt-4o'
        : type === 'gemini' ? 'gemini-2.0-flash'
        : 'google/gemma-3-27b-it:free';
      const modelId = resolved.defaultModel ?? fallback;

      // Deduplicate: same provider+model only appears once
      const dedupeKey = `${type}:${modelId}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      try {
        const model = getModel(resolved, fallback);
        results.push({ model, providerType: type, modelId });
      } catch (err) {
        logger.warn({ provider: type, error: err instanceof Error ? err.message : String(err) }, 'provider init failed, skipping');
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
