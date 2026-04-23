import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { getConfigDir, expandPath } from '../config/loader.js';
import { truncateToTokens } from '../utils/tokens.js';
import { getLogger } from '../utils/logger.js';

// ═══════════════════════════════════════════
// Instructions Loader (PEGASUS.md + CLAUDE.md compat)
// ═══════════════════════════════════════════

const logger = getLogger('instructions');
const MAX_FILE_TOKENS = 3000;

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

/** Load all .md files from a directory */
function loadMdDir(dirPath: string): string[] {
  try {
    if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) return [];
    const files = readdirSync(dirPath, { recursive: true }) as string[];
    return files
      .filter(f => extname(String(f)) === '.md')
      .map(f => safeRead(join(dirPath, String(f))))
      .filter((c): c is string => c !== null && c.trim().length > 0);
  } catch {
    return [];
  }
}

// ═══ Core Instructions (always loaded) ═══

/** Load ~/.pegasus/instructions.md — ALWAYS present */
export function loadInstructions(): string {
  const path = join(getConfigDir(), 'instructions.md');
  const content = safeRead(path);
  if (!content) {
    logger.warn('instructions.md not found, using minimal fallback');
    return 'You are Pegasus, a helpful AI assistant with persistent memory.';
  }
  return truncateToTokens(stripComments(content), MAX_FILE_TOKENS);
}

/** Load ~/.pegasus/persona.md */
export function loadPersona(): string | null {
  const path = join(getConfigDir(), 'persona.md');
  const content = safeRead(path);
  return content ? truncateToTokens(stripComments(content), MAX_FILE_TOKENS) : null;
}

/** Load ~/.pegasus/user.md */
export function loadUserProfile(): string | null {
  const path = join(getConfigDir(), 'user.md');
  const content = safeRead(path);
  return content ? truncateToTokens(stripComments(content), MAX_FILE_TOKENS) : null;
}

// ═══ Project Instructions (PEGASUS.md + CLAUDE.md compat) ═══

/**
 * Load project instructions from current directory.
 * PEGASUS.md takes priority. CLAUDE.md is loaded for compatibility.
 */
export function loadProjectInstructions(): string[] {
  const cwd = process.cwd();
  const results: string[] = [];

  // Priority order: PEGASUS.md > CLAUDE.md
  for (const name of ['PEGASUS.md', 'CLAUDE.md']) {
    const content = safeRead(join(cwd, name));
    if (content) {
      results.push(truncateToTokens(stripComments(content), MAX_FILE_TOKENS));
    }
    // Also check hidden dir variant
    const hiddenContent = safeRead(join(cwd, name === 'PEGASUS.md' ? '.pegasus' : '.claude', name));
    if (hiddenContent) {
      results.push(truncateToTokens(stripComments(hiddenContent), MAX_FILE_TOKENS));
    }
  }

  return results;
}

/**
 * Load project rules from .pegasus/rules/ and .claude/rules/ (compat).
 * Consumes Claude Code rules without modifying them.
 */
export function loadProjectRules(): string[] {
  const cwd = process.cwd();
  const results: string[] = [];

  // Load from both directories
  for (const dir of ['.pegasus/rules', '.claude/rules']) {
    const rules = loadMdDir(join(cwd, dir));
    results.push(...rules.map(r => truncateToTokens(stripComments(r), MAX_FILE_TOKENS)));
  }

  return results;
}
