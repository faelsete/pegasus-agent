import { generateText, type CoreMessage } from 'ai';
import { buildContext } from './context.js';
import { selectModel } from './router.js';
import { extractThinking } from './thinker.js';
import { extractAndStore } from '../memory/extractor.js';
import { getAiSdkTools } from '../tools/registry.js';
import { searchRelevantContext } from '../memory/search.js';
import { getLogger } from '../utils/logger.js';

// ═══════════════════════════════════════════
// Cortex — Main Reasoning Loop
// SEARCH → THINK → ACT → REMEMBER → RESPOND
// ═══════════════════════════════════════════

const logger = getLogger('cortex');

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
 * Main reasoning function. Called for every user message.
 * Implements the SEARCH → THINK → ACT → REMEMBER → RESPOND pipeline.
 */
export async function reason(input: ReasonInput): Promise<ReasonOutput> {
  const startTime = Date.now();

  // ═══ STEP 1: SEARCH — Build context with relevant memories ═══
  logger.info({ msg: input.userMessage.slice(0, 80) }, 'reasoning started');

  const memories = await searchRelevantContext(input.userMessage);
  const systemPrompt = await buildContext(input.userMessage, input.userId);

  // ═══ STEP 2: THINK + ACT — Generate response with tools ═══
  const model = selectModel('text');
  const tools = getAiSdkTools();

  const messages: CoreMessage[] = [
    ...input.conversationHistory,
    { role: 'user' as const, content: input.userMessage },
  ];

  const result = await generateText({
    model,
    system: systemPrompt,
    messages,
    tools,
    maxSteps: 10,
    temperature: 0.7,
    onStepFinish: async ({ toolResults }) => {
      if (toolResults && Array.isArray(toolResults) && toolResults.length > 0) {
        logger.debug({ count: toolResults.length }, 'tools executed in step');
      }
    },
  });

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
