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
// Context Builder — 8-Layer System Prompt
// Single source of memory search (no duplicates)
// ═══════════════════════════════════════════

const logger = getLogger('context');

export interface ContextResult {
  prompt: string;
  memoriesFound: number;
}

/**
 * Build the complete system prompt with all 8 layers.
 * Called before EVERY LLM call.
 * Returns both the prompt AND how many memories were found.
 */
export async function buildContext(userMessage: string, userId: string): Promise<ContextResult> {
  const config = getConfig();
  const sections: string[] = [];
  let memoriesFound = 0;

  // LAYER 1: Core Rules (ALWAYS present, never removed)
  const instructions = loadInstructions();
  sections.push(`<system_rules>\n${instructions}\n</system_rules>`);

  // LAYER 2: Persona
  const persona = loadPersona();
  if (persona) {
    sections.push(`<persona>\n${persona}\n</persona>`);
  }

  // LAYER 3: User Profile
  const userProfile = loadUserProfile();
  if (userProfile) {
    sections.push(`<user_profile>\n${userProfile}\n</user_profile>`);
  }

  // LAYER 4: Project Instructions (PEGASUS.md > CLAUDE.md)
  const projectInstructions = loadProjectInstructions();
  if (projectInstructions.length > 0) {
    sections.push(`<project_instructions>\n${projectInstructions.join('\n---\n')}\n</project_instructions>`);
  }

  // LAYER 5: Project Rules
  const projectRules = loadProjectRules();
  if (projectRules.length > 0) {
    sections.push(`<project_rules>\n${projectRules.join('\n---\n')}\n</project_rules>`);
  }

  // LAYER 6: Relevant Memories (semantic search) — SINGLE search, no duplicates
  try {
    const memories = await searchRelevantContext(userMessage);
    memoriesFound = memories.length;
    if (memories.length > 0) {
      const block = memories.map(m =>
        `- [${m.type}|score:${m.score.toFixed(2)}] ${m.text}`
      ).join('\n');
      sections.push(`<relevant_memories>\nThese are memories from previous conversations. Use them if relevant:\n${block}\n</relevant_memories>`);
    }
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err) }, 'memory search failed, skipping');
  }

  // LAYER 7: Knowledge Graph Context
  try {
    const entities = searchRelatedEntities(userMessage);
    if (entities.length > 0) {
      const block = entities.map(e =>
        `- ${e.name} (${e.type}): ${e.summary ?? 'no summary'} [seen ${e.accessCount}x]`
      ).join('\n');
      sections.push(`<knowledge_context>\n${block}\n</knowledge_context>`);
    }
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err) }, 'knowledge search failed, skipping');
  }

  // LAYER 8: Thinking Instruction
  if (config.thinkingEnabled) {
    sections.push(THINKING_INSTRUCTION);
  }

  const fullContext = sections.join('\n\n');
  logger.debug({
    layers: sections.length,
    chars: fullContext.length,
    memories: memoriesFound,
  }, 'context built');

  return { prompt: fullContext, memoriesFound };
}
