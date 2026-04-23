import { createOpenAI } from '@ai-sdk/openai';
import { embedMany, embed } from 'ai';
import { getConfig } from '../config/loader.js';
import { getLogger } from '../utils/logger.js';

// ═══════════════════════════════════════════
// Embedding Client
// ═══════════════════════════════════════════

const logger = getLogger('embeddings');

/** LRU cache for recent embeddings */
const cache = new Map<string, number[]>();
const MAX_CACHE = 1000;

function getCacheKey(text: string): string {
  // Simple hash for cache key
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return String(hash);
}

function getEmbeddingModel() {
  const config = getConfig();
  const memConfig = config.memory;

  const provider = config.providers.find(p => p.type === memConfig.embeddingProvider && p.enabled);
  if (!provider?.apiKey) {
    throw new Error(`No API key for embedding provider: ${memConfig.embeddingProvider}`);
  }

  const openai = createOpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseUrl ?? 'https://openrouter.ai/api/v1',
  });

  return openai.embedding(memConfig.embeddingModel);
}

/** Generate embedding for a single text */
export async function embedText(text: string): Promise<number[]> {
  const key = getCacheKey(text);
  const cached = cache.get(key);
  if (cached) return cached;

  const model = getEmbeddingModel();
  const result = await embed({ model, value: text });

  // LRU eviction
  if (cache.size >= MAX_CACHE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, result.embedding);

  return result.embedding;
}

/** Generate embeddings for multiple texts (batch) */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const model = getEmbeddingModel();

  // Process in chunks of 100
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const chunk = texts.slice(i, i + 100);
    const result = await embedMany({ model, values: chunk });
    results.push(...result.embeddings);
  }

  logger.debug({ count: texts.length }, 'batch embedding complete');
  return results;
}
