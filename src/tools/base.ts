import { tool } from 'ai';
import { z, type ZodObject, type ZodRawShape } from 'zod';

// ═══════════════════════════════════════════
// Tool Base — buildTool() (Claude Code pattern)
// ═══════════════════════════════════════════

export interface PegasusTool {
  name: string;
  description: string;
  isEnabled: () => boolean;
  isReadOnly: boolean;
  needsConfirmation: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  aiSdkTool: any; // AI SDK tool type varies by version
}

export function buildTool<T extends ZodRawShape>(config: {
  name: string;
  description: string;
  inputSchema: ZodObject<T>;
  isReadOnly?: boolean;
  needsConfirmation?: boolean;
  isEnabled?: () => boolean;
  execute: (input: z.infer<ZodObject<T>>) => Promise<string>;
}): PegasusTool {
  return {
    name: config.name,
    description: config.description,
    isEnabled: config.isEnabled ?? (() => true),
    isReadOnly: config.isReadOnly ?? true,
    needsConfirmation: config.needsConfirmation ?? false,
    aiSdkTool: tool({
      description: config.description,
      parameters: config.inputSchema,
      execute: config.execute,
    }),
  };
}
