import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import dotenv from 'dotenv';
import { PegasusConfigSchema, type PegasusConfig, type ProviderConfig } from './schema.js';
import { DEFAULT_CONFIG } from './defaults.js';

// ═══════════════════════════════════════════
// Configuration Loader
// ═══════════════════════════════════════════

let cachedConfig: PegasusConfig | null = null;

/** Resolve ~ to home directory */
export function expandPath(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return join(homedir(), p.slice(1));
  }
  return p;
}

/** Get the Pegasus config directory */
export function getConfigDir(): string {
  return expandPath('~/.pegasus');
}

/** Get the Pegasus data directory */
export function getDataDir(): string {
  const config = getConfig();
  return expandPath(config.dataDir);
}

/** Build providers array from environment variables */
function buildProvidersFromEnv(): ProviderConfig[] {
  const providers: ProviderConfig[] = [];

  if (process.env.NVIDIA_API_KEY) {
    providers.push({
      type: 'nvidia',
      apiKey: process.env.NVIDIA_API_KEY,
      baseUrl: process.env.NVIDIA_BASE_URL ?? 'https://integrate.api.nvidia.com/v1',
      defaultModel: process.env.NVIDIA_MODEL ?? 'meta/llama-3.1-70b-instruct',
      enabled: true,
    });
  }

  if (process.env.OPENROUTER_API_KEY) {
    providers.push({
      type: 'openrouter',
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: 'https://openrouter.ai/api/v1',
      defaultModel: process.env.OPENROUTER_MODEL,
      enabled: true,
    });
  }

  if (process.env.GEMINI_API_KEY) {
    providers.push({
      type: 'gemini',
      apiKey: process.env.GEMINI_API_KEY,
      defaultModel: process.env.GEMINI_MODEL ?? 'gemini-2.5-pro',
      enabled: true,
    });
  }

  if (process.env.OPENAI_API_KEY) {
    providers.push({
      type: 'codex',
      apiKey: process.env.OPENAI_API_KEY,
      defaultModel: process.env.OPENAI_MODEL ?? 'gpt-4o',
      enabled: true,
    });
  }

  if (process.env.HUGGINGFACE_TOKEN) {
    providers.push({
      type: 'huggingface',
      apiKey: process.env.HUGGINGFACE_TOKEN,
      defaultModel: process.env.HUGGINGFACE_IMAGE_MODEL ?? 'black-forest-labs/FLUX.1-dev',
      enabled: true,
    });
  }

  if (process.env.OLLAMA_BASE_URL) {
    providers.push({
      type: 'ollama',
      baseUrl: process.env.OLLAMA_BASE_URL,
      defaultModel: process.env.OLLAMA_MODEL ?? 'llama3.1',
      enabled: true,
    });
  }

  return providers;
}

/** Build Telegram config from env */
function buildTelegramFromEnv() {
  return {
    token: process.env.TELEGRAM_TOKEN ?? '',
    allowedChatIds: (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? '')
      .split(',')
      .filter(Boolean)
      .map(Number),
    rateLimitPerMinute: 30,
  };
}

/** Load config: .env → config.json → defaults → validate */
export function loadConfig(): PegasusConfig {
  // 1. Load .env
  dotenv.config();

  // 2. Try config.json
  const configPath = join(getConfigDir(), 'config.json');
  let fileConfig: Partial<PegasusConfig> = {};
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, 'utf-8');
      fileConfig = JSON.parse(raw) as Partial<PegasusConfig>;
    } catch {
      // Invalid JSON — use defaults
    }
  }

  // 3. Build from env
  const envProviders = buildProvidersFromEnv();
  const envTelegram = buildTelegramFromEnv();

  // 4. Merge: env overrides file, file overrides defaults
  const merged = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    providers: envProviders.length > 0 ? envProviders : (fileConfig.providers ?? DEFAULT_CONFIG.providers),
    telegram: envTelegram.token ? envTelegram : (fileConfig.telegram ?? DEFAULT_CONFIG.telegram),
    logLevel: (process.env.PEGASUS_LOG_LEVEL as PegasusConfig['logLevel']) ?? fileConfig.logLevel ?? DEFAULT_CONFIG.logLevel,
    dataDir: process.env.PEGASUS_DATA_DIR ?? fileConfig.dataDir ?? DEFAULT_CONFIG.dataDir,
  };

  // 5. Validate
  const result = PegasusConfigSchema.safeParse(merged);
  if (!result.success) {
    console.error('❌ Invalid configuration:', result.error.format());
    process.exit(1);
  }

  cachedConfig = result.data;
  return cachedConfig;
}

/** Get cached config or load */
export function getConfig(): PegasusConfig {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}

/** Reload config from disk */
export function reloadConfig(): PegasusConfig {
  cachedConfig = null;
  return loadConfig();
}

/**
 * Update a specific provider's defaultModel in config.json and reload.
 * Used by /setmodel Telegram command.
 */
export function updateProviderModel(providerType: string, newModel: string): void {
  const configPath = join(getConfigDir(), 'config.json');
  if (!existsSync(configPath)) return;

  const raw = readFileSync(configPath, 'utf-8');
  const json = JSON.parse(raw) as Record<string, unknown>;
  const providers = json.providers as Array<Record<string, unknown>> | undefined;

  if (providers) {
    const target = providers.find(p => p.type === providerType && p.enabled !== false);
    if (target) {
      target.defaultModel = newModel;
      writeFileSync(configPath, JSON.stringify(json, null, 2), 'utf-8');
    }
  }

  reloadConfig();
}

/**
 * Toggle thinkingEnabled in config.json and reload.
 */
export function toggleThinking(enabled: boolean): void {
  const configPath = join(getConfigDir(), 'config.json');
  if (!existsSync(configPath)) return;

  const raw = readFileSync(configPath, 'utf-8');
  const json = JSON.parse(raw) as Record<string, unknown>;
  json.thinkingEnabled = enabled;
  writeFileSync(configPath, JSON.stringify(json, null, 2), 'utf-8');

  reloadConfig();
}
