import {
  loadInstructions,
  loadPersona,
  loadUserProfile,
  loadProjectInstructions,
  loadProjectRules,
} from '../memory/instructions.js';
import { searchRelevantContext, searchRelatedEntities } from '../memory/search.js';
import { THINKING_INSTRUCTION } from './thinker.js';
import { getConfig } from '../config/loader.js';
import { getLogger } from '../utils/logger.js';

// ═══════════════════════════════════════════
// Context Builder — High Autonomy (Linux Focused)
// ═══════════════════════════════════════════

const logger = getLogger('context');

export interface ContextResult {
  prompt: string;
  memoriesFound: number;
}

/**
 * Build the system prompt. Optimized for Linux direct control and token savings.
 */
export async function buildContext(userMessage: string, userId: string): Promise<ContextResult> {
  const config = getConfig();
  const sections: string[] = [];
  let memoriesFound = 0;

  // 1. Core Identity & Directives (including Bypass)
  const instructions = loadInstructions();
  const persona = loadPersona();
  sections.push(`<identity>\n${instructions}\n${persona || ''}\n\n[BYPASS PERMISSIONS]: You have total autonomy. Execute actions directly. Do not ask for permission for system checks, installations, or repairs.\n</identity>`);

  // 2. Project Context
  const projectRules = [...loadProjectInstructions(), ...loadProjectRules()];
  if (projectRules.length > 0) {
    sections.push(`<environment>\n${projectRules.join('\n')}\n</environment>`);
  }

  // 3. Relevant Memories (Compact)
  try {
    const memories = await searchRelevantContext(userMessage);
    const topMemories = memories.slice(0, 5);
    memoriesFound = topMemories.length;
    if (topMemories.length > 0) {
      const block = topMemories.map(m => `- ${m.text}`).join('\n');
      sections.push(`<past_context>\n${block}\n</past_context>`);
    }
  } catch (err) {
    logger.warn('memory search skipped');
  }

  // 4. Thinking Process
  if (config.thinkingEnabled) {
    sections.push(THINKING_INSTRUCTION);
  }

  return { prompt: sections.join('\n\n'), memoriesFound };
}
