import { createProvider, getDefaultTextProvider, getProviderConfig } from '../models/providers.js';
import type { ProviderConfig } from '../config/schema.js';
import type { TaskType } from '../models/types.js';
import { getLogger } from '../utils/logger.js';

// ═══════════════════════════════════════════
// Model Router — selects model by task type
// ═══════════════════════════════════════════

const logger = getLogger('router');

/**
 * Create a LanguageModel from a provider instance + model ID.
 * Handles both createOpenAI (callable) and createOpenAICompatible (.chatModel())
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getModel(providerConfig: ProviderConfig, fallbackModel: string): any {
  const sdk = createProvider(providerConfig);
  const modelId = providerConfig.defaultModel ?? fallbackModel;

  // createOpenAICompatible returns an object with .chatModel()
  // createOpenAI and createGoogleGenerativeAI return a callable function
  if (typeof sdk === 'function') {
    return sdk(modelId);
  }
  if (sdk && typeof sdk === 'object' && 'chatModel' in sdk) {
    return (sdk as { chatModel: (id: string) => unknown }).chatModel(modelId);
  }
  // Fallback: try calling as function
  return (sdk as unknown as (id: string) => unknown)(modelId);
}

/**
 * Select the appropriate model for a given task type.
 * Priority: configured default → fallback chain
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function selectModel(task: TaskType): any {
  switch (task) {
    case 'text': {
      const provider = getDefaultTextProvider();
      logger.debug({ provider: provider.type, model: provider.defaultModel }, 'selected text model');
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
