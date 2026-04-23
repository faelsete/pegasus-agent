import { generateText, type CoreMessage } from 'ai';
import { buildContext } from './context.js';
import { getAllTextModels } from './router.js';
import { extractThinking } from './thinker.js';
import { extractAndStore } from '../memory/extractor.js';
import { getAiSdkTools } from '../tools/registry.js';
import { searchRelevantContext } from '../memory/search.js';
import { getLogger } from '../utils/logger.js';

// ═══════════════════════════════════════════
// Cortex — Main Reasoning Loop
// SEARCH → THINK → ACT → REMEMBER → RESPOND
// With automatic provider fallback
// ═══════════════════════════════════════════

const logger = getLogger('cortex');
const TIMEOUT_MS = 60_000; // 60s per provider attempt

export interface ReasonInput {
  userMessage: string;
  conversationHistory: CoreMessage[];
  userId: string;
  conversationId?: string;
}

export interface ReasonOutput {
  response: string;
  thinking: string;
  toolsUsed: string[];
  memoriesFound: number;
}

/**
 * Try generateText with a single model, with timeout.
 * Returns the result or throws on failure/timeout.
 */
async function tryGenerate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
  systemPrompt: string,
  messages: CoreMessage[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: any,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    return await generateText({
      model,
      system: systemPrompt,
      messages,
      tools,
      maxSteps: 10,
      temperature: 0.7,
      abortSignal: controller.signal,
      onStepFinish: async ({ toolResults }) => {
        if (toolResults && Array.isArray(toolResults) && toolResults.length > 0) {
          logger.debug({ count: toolResults.length }, 'tools executed in step');
        }
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Main reasoning function. Called for every user message.
 * Implements the SEARCH → THINK → ACT → REMEMBER → RESPOND pipeline.
 * Automatically falls back to next provider if one fails or times out.
 */
export async function reason(input: ReasonInput): Promise<ReasonOutput> {
  const startTime = Date.now();

  // ═══ STEP 1: SEARCH — Build context with relevant memories ═══
  logger.info({ msg: input.userMessage.slice(0, 80) }, 'reasoning started');

  // Memory search is non-fatal — if it fails, continue without memories
  let memories: Awaited<ReturnType<typeof searchRelevantContext>> = [];
  try {
    memories = await searchRelevantContext(input.userMessage);
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err) }, 'memory search failed, continuing without');
  }

  let systemPrompt: string;
  try {
    systemPrompt = await buildContext(input.userMessage, input.userId);
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err) }, 'context build failed, using minimal');
    systemPrompt = 'You are Pegasus, a helpful AI assistant. Respond in the user\'s language.';
  }

  const tools = getAiSdkTools();

  const messages: CoreMessage[] = [
    ...input.conversationHistory,
    { role: 'user' as const, content: input.userMessage },
  ];

  // ═══ STEP 2: THINK + ACT — Try each provider with fallback ═══
  const models = getAllTextModels();
  if (models.length === 0) {
    throw new Error('No text providers available. Run: npm run setup');
  }

  logger.info({ providers: models.length, chain: models.map(m => `${m.providerType}:${m.modelId}`).join(' → ') }, 'fallback chain');

  let result;
  let usedProvider = 'unknown';

  for (const { model, providerType, modelId } of models) {
    try {
      logger.info({ provider: providerType, model: modelId }, 'trying provider');
      result = await tryGenerate(model, systemPrompt, messages, tools);
      usedProvider = providerType;
      logger.info({ provider: providerType }, 'provider responded');
      break; // success, stop trying
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isTimeout = errMsg.includes('abort') || errMsg.includes('AbortError');
      logger.warn(
        { provider: providerType, model: modelId, error: errMsg, timeout: isTimeout },
        isTimeout ? 'provider timed out, trying fallback' : 'provider failed, trying fallback'
      );
      // Continue to next provider
    }
  }

  if (!result) {
    throw new Error('All providers failed. Check your API keys and network connection.');
  }

  // ═══ STEP 3: Extract thinking (not shown to user) ═══
  const { thinking, response } = extractThinking(result.text);
  if (thinking) {
    logger.debug({ thinking: thinking.slice(0, 200) }, 'internal reasoning');
  }

  // ═══ STEP 4: REMEMBER — Extract and store memories (non-blocking) ═══
  extractAndStore(input.userMessage, response, input.conversationId).catch(err => {
    logger.debug({ error: err instanceof Error ? err.message : String(err) }, 'extraction failed');
  });

  // ═══ STEP 5: RESPOND ═══
  const elapsed = Date.now() - startTime;
  const toolsUsed = result.toolCalls?.map(t => t.toolName) ?? [];

  logger.info({
    elapsed: `${elapsed}ms`,
    provider: usedProvider,
    tools: toolsUsed.length,
    memories: memories.length,
    responseLen: response.length,
  }, 'reasoning complete');

  return {
    response,
    thinking,
    toolsUsed,
    memoriesFound: memories.length,
  };
}
