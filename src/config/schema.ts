import { z } from 'zod';

// ═══════════════════════════════════════════
// 🐴 PEGASUS — Configuration Schemas
// ═══════════════════════════════════════════

export const ProviderSchema = z.object({
  type: z.enum(['nvidia', 'openrouter', 'gemini', 'codex', 'huggingface', 'ollama']),
  apiKey: z.string().optional(),
  apiKeys: z.array(z.string()).optional(), // Multiple keys for round-robin fallback
  baseUrl: z.string().url().optional(),
  defaultModel: z.string().optional(),
  enabled: z.boolean().default(true),
});

export const TelegramSchema = z.object({
  token: z.string().min(20),
  allowedChatIds: z.array(z.number()).min(1),
  rateLimitPerMinute: z.number().default(30),
});

export const MemorySchema = z.object({
  embeddingModel: z.string().default('nvidia/nv-embedqa-e5-v5'),
  embeddingProvider: z.enum(['openrouter', 'ollama', 'nvidia']).default('nvidia'),
  maxSearchResults: z.number().default(10),
  autoExtract: z.boolean().default(true),
  dreamIntervalMs: z.number().default(21_600_000), // 6h
  consolidationThreshold: z.number().min(0).max(1).default(0.92),
});

export const PersonaSchema = z.object({
  name: z.string().default('Pegasus'),
  language: z.string().default('pt-BR'),
  timezone: z.string().default('America/Sao_Paulo'),
  style: z.enum(['technical', 'friendly', 'creative', 'custom']).default('technical'),
});

export const HeartbeatSchema = z.object({
  enabled: z.boolean().default(true),
  intervalMs: z.number().default(300_000), // 5 min
  actions: z.array(z.string()).default(['health_check', 'memory_consolidation']),
});

export const DoctorSchema = z.object({
  autoRepair: z.boolean().default(true),
  checkIntervalMs: z.number().default(3_600_000), // 1h
});

export const PegasusConfigSchema = z.object({
  providers: z.array(ProviderSchema).min(1),
  telegram: TelegramSchema,
  memory: MemorySchema,
  persona: PersonaSchema,
  heartbeat: HeartbeatSchema,
  doctor: DoctorSchema,
  dataDir: z.string().default('~/.pegasus/data'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  maxContextTokens: z.number().default(12_000),
  thinkingEnabled: z.boolean().default(true),
});

export type PegasusConfig = z.infer<typeof PegasusConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderSchema>;
export type MemoryConfig = z.infer<typeof MemorySchema>;
export type PersonaConfig = z.infer<typeof PersonaSchema>;
