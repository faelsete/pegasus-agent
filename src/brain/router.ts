import type { LanguageModel } from 'ai';
import { createProvider, getDefaultTextProvider, getProviderConfig } from '../models/providers.js';
import type { TaskType } from '../models/types.js';
import { getLogger } from '../utils/logger.js';

// ═══════════════════════════════════════════
// Model Router — selects model by task type
// ═══════════════════════════════════════════

const logger = getLogger('router');

/**
 * Select the appropriate model for a given task type.
 * Priority: configured default → fallback chain
 */
export function selectModel(task: TaskType): LanguageModel {
  switch (task) {
    case 'text': {
      const provider = getDefaultTextProvider();
      const sdk = createProvider(provider);
      const modelId = provider.defaultModel ?? 'meta/llama-3.1-70b-instruct';
      logger.debug({ provider: provider.type, model: modelId }, 'selected text model');
      return sdk(modelId);
    }

    case 'fast': {
      // Try ollama first (free, fast), then nvidia, then openrouter
      const ollama = getProviderConfig('ollama');
      if (ollama) {
        const sdk = createProvider(ollama);
        return sdk(ollama.defaultModel ?? 'llama3.1');
      }
      // Fall back to main text model
      return selectModel('text');
    }

    case 'code': {
      // Prefer codex/openai for code, fallback to text
      const codex = getProviderConfig('codex');
      if (codex) {
        const sdk = createProvider(codex);
        return sdk(codex.defaultModel ?? 'gpt-4o');
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
