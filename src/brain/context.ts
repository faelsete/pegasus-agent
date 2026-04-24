import {
  loadInstructions,
  loadPersona,
} from '../memory/instructions.js';
import { searchRelevantContext } from '../memory/search.js';
import { THINKING_INSTRUCTION } from './thinker.js';
import { getConfig } from '../config/loader.js';
import { estimateTokens, truncateToTokens } from '../utils/tokens.js';
import { getLogger } from '../utils/logger.js';

// ═══════════════════════════════════════════
// Context Builder — Budget-Aware, Cached
// ═══════════════════════════════════════════

const logger = getLogger('context');

export interface ContextResult {
  prompt: string;
  memoriesFound: number;
  tokenEstimate: number;
}

// ═══ Cached system prompt (static parts) ═══
let cachedSystemBase: string | null = null;
let cachedSystemTokens = 0;

function getSystemBase(): string {
  if (cachedSystemBase !== null) return cachedSystemBase;

  const instructions = loadInstructions();
  const persona = loadPersona();

  cachedSystemBase = [
    `<identity>`,
    instructions,
    persona || '',
    `[AUTONOMY]: Execute actions directly. Always use sudo for privileged commands (apt, systemctl, etc).`,
    `</identity>`,
  ].filter(Boolean).join('\n');

  cachedSystemTokens = estimateTokens(cachedSystemBase);
  logger.info({ tokens: cachedSystemTokens }, 'system base prompt cached');
  return cachedSystemBase;
}

/** Clear cached system base (called on /restart) */
export function clearContextCache(): void {
  cachedSystemBase = null;
  cachedSystemTokens = 0;
}

/**
 * Build the system prompt with automatic budget enforcement.
 *
 * Budget allocation (from maxContextTokens):
 *   - System base (identity/persona): ~600 tokens (fixed, cached)
 *   - Memories: up to 500 tokens
 *   - Thinking instruction: ~30 tokens
 *   - Remaining: available for conversation history (managed by caller)
 */
export async function buildContext(userMessage: string, _userId: string): Promise<ContextResult> {
  const config = getConfig();
  const maxTokens = config.maxContextTokens;
  const sections: string[] = [];
  let memoriesFound = 0;
  let totalTokens = 0;

  // 1. System base (cached — no disk I/O)
  const base = getSystemBase();
  sections.push(base);
  totalTokens += cachedSystemTokens;

  // 2. Relevant Memories (budget: max 300 tokens)
  const MEMORY_BUDGET = 300;
  try {
    const memories = await searchRelevantContext(userMessage);
    const topMemories = memories.slice(0, 5);
    memoriesFound = topMemories.length;
    if (topMemories.length > 0) {
      let memBlock = topMemories.map(m => `- ${m.text}`).join('\n');
      const memTokens = estimateTokens(memBlock);
      if (memTokens > MEMORY_BUDGET) {
        memBlock = truncateToTokens(memBlock, MEMORY_BUDGET);
      }
      sections.push(`<past_context>\n${memBlock}\n</past_context>`);
      totalTokens += Math.min(memTokens, MEMORY_BUDGET);
    }
  } catch {
    logger.warn('memory search skipped');
  }

  // 3. Thinking (only if enabled and budget allows)
  if (config.thinkingEnabled && totalTokens + 50 < maxTokens) {
    sections.push(THINKING_INSTRUCTION);
    totalTokens += 30;
  }

  const prompt = sections.join('\n\n');

  logger.debug({
    systemTokens: cachedSystemTokens,
    memoryTokens: totalTokens - cachedSystemTokens - 30,
    totalTokens,
    budget: maxTokens,
  }, 'context built');

  return { prompt, memoriesFound, tokenEstimate: totalTokens };
}

/**
 * Calculate how many tokens are available for conversation history.
 * Used by telegram.ts to intelligently trim history.
 */
export function getHistoryBudget(systemTokenEstimate: number): number {
  const config = getConfig();
  // Reserve 2000 tokens for the model's response
  const RESPONSE_RESERVE = 2000;
  return Math.max(0, config.maxContextTokens - systemTokenEstimate - RESPONSE_RESERVE);
}
