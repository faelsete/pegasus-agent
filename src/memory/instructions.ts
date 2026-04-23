import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getConfigDir } from '../config/loader.js';
import { truncateToTokens } from '../utils/tokens.js';
import { getLogger } from '../utils/logger.js';

// ═══════════════════════════════════════════
// Instructions Loader — Cached, No CLAUDE.md
// ═══════════════════════════════════════════

const logger = getLogger('instructions');
const MAX_FILE_TOKENS = 2000;

// ═══ In-Memory Cache ═══
let cachedInstructions: string | null = null;
let cachedPersona: string | null = null;

/** Safely read a file, return null if not found */
function safeRead(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

/** Strip HTML comments from markdown */
function stripComments(content: string): string {
  return content.replace(/<!--[\s\S]*?-->/g, '').trim();
}

// ═══ Core Instructions (cached after first load) ═══

/** Load ~/.pegasus/instructions.md — cached in memory */
export function loadInstructions(): string {
  if (cachedInstructions !== null) return cachedInstructions;

  const path = join(getConfigDir(), 'instructions.md');
  const content = safeRead(path);
  if (!content) {
    logger.warn('instructions.md not found, using minimal fallback');
    cachedInstructions = 'You are Pegasus, a helpful AI assistant with persistent memory. Use sudo for privileged commands.';
    return cachedInstructions;
  }
  cachedInstructions = truncateToTokens(stripComments(content), MAX_FILE_TOKENS);
  logger.info('instructions.md loaded and cached');
  return cachedInstructions;
}

/** Load ~/.pegasus/persona.md — cached in memory */
export function loadPersona(): string | null {
  if (cachedPersona !== null) return cachedPersona || null;

  const path = join(getConfigDir(), 'persona.md');
  const content = safeRead(path);
  cachedPersona = content ? truncateToTokens(stripComments(content), MAX_FILE_TOKENS) : '';
  if (cachedPersona) logger.info('persona.md loaded and cached');
  return cachedPersona || null;
}

/** Load ~/.pegasus/user.md */
export function loadUserProfile(): string | null {
  const path = join(getConfigDir(), 'user.md');
  const content = safeRead(path);
  return content ? truncateToTokens(stripComments(content), MAX_FILE_TOKENS) : null;
}

/** Flush cache — called on /restart or config reload */
export function clearInstructionCache(): void {
  cachedInstructions = null;
  cachedPersona = null;
  logger.info('instruction cache cleared');
}

// ═══ Project Instructions — REMOVED ═══
// CLAUDE.md and project-level scanning was removed.
// The bot should not load development rules as AI context.

export function loadProjectInstructions(): string[] {
  return []; // Disabled — no project-level scanning
}

export function loadProjectRules(): string[] {
  return []; // Disabled — no project-level scanning
}
