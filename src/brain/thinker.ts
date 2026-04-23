// ═══════════════════════════════════════════
// Thinker — Chain-of-Thought Extraction
// ═══════════════════════════════════════════

/**
 * Extract internal thinking from model response.
 * The model is instructed to wrap reasoning in <thinking> tags.
 * Thinking is logged but NOT sent to the user.
 */
export function extractThinking(response: string): {
  thinking: string;
  response: string;
} {
  const thinkingRegex = /<thinking>([\s\S]*?)<\/thinking>/g;
  const matches: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = thinkingRegex.exec(response)) !== null) {
    if (match[1]) matches.push(match[1].trim());
  }

  const cleanResponse = response.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();

  return {
    thinking: matches.join('\n---\n'),
    response: cleanResponse,
  };
}

/** Thinking instruction to append to system prompt */
export const THINKING_INSTRUCTION = `
<meta_instruction>
Before answering, ALWAYS reason internally using <thinking>...</thinking> tags.
Inside thinking:
1. Check if relevant_memories contain context about this topic
2. If yes, plan how to incorporate that context naturally
3. Consider what entities/facts to extract from this exchange
4. Plan your response approach

The user will NOT see your thinking. Only your response after </thinking>.
</meta_instruction>`;
