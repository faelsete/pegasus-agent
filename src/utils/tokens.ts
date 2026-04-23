// ═══════════════════════════════════════════
// Simple Token Estimator
// ═══════════════════════════════════════════

/**
 * Rough token count estimation.
 * ~4 chars per token for English, ~3 for mixed/code.
 * Good enough for context budget management.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/** Truncate text to fit within token budget */
export function truncateToTokens(text: string, maxTokens: number): string {
  const estimated = estimateTokens(text);
  if (estimated <= maxTokens) return text;

  const maxChars = Math.floor(maxTokens * 3.5);
  const truncated = text.slice(0, maxChars);
  const lastNewline = truncated.lastIndexOf('\n');
  return (lastNewline > maxChars * 0.8 ? truncated.slice(0, lastNewline) : truncated) +
    '\n\n[... truncated to fit context window ...]';
}
