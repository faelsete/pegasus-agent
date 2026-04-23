import type { PegasusConfig } from './schema.js';

// ═══════════════════════════════════════════
// Default configuration values
// ═══════════════════════════════════════════

export const DEFAULT_CONFIG: PegasusConfig = {
  providers: [],
  telegram: {
    token: '',
    allowedChatIds: [],
    rateLimitPerMinute: 30,
  },
  memory: {
    embeddingModel: 'openai/text-embedding-3-small',
    embeddingProvider: 'openrouter',
    maxSearchResults: 10,
    autoExtract: true,
    dreamIntervalMs: 21_600_000,
    consolidationThreshold: 0.92,
  },
  persona: {
    name: 'Pegasus',
    language: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    style: 'technical',
  },
  heartbeat: {
    enabled: true,
    intervalMs: 300_000,
    actions: ['health_check', 'memory_consolidation'],
  },
  doctor: {
    autoRepair: true,
    checkIntervalMs: 3_600_000,
  },
  dataDir: '~/.pegasus/data',
  logLevel: 'info',
  maxContextTokens: 12_000,
  thinkingEnabled: true,
};
