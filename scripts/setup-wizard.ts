import * as readline from 'node:readline/promises';
import { writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ═══════════════════════════════════════════
// 🐴 PEGASUS — Setup Wizard
// ═══════════════════════════════════════════

const CONFIG_DIR = join(homedir(), '.pegasus');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

interface WizardConfig {
  providers: Array<{
    type: string;
    apiKey?: string;
    baseUrl?: string;
    defaultModel?: string;
    enabled: boolean;
  }>;
  telegram: {
    token: string;
    allowedChatIds: number[];
    rateLimitPerMinute: number;
  };
  memory: {
    embeddingModel: string;
    embeddingProvider: string;
    maxSearchResults: number;
    autoExtract: boolean;
    dreamIntervalMs: number;
    consolidationThreshold: number;
  };
  persona: {
    name: string;
    language: string;
    timezone: string;
    style: string;
  };
  heartbeat: {
    enabled: boolean;
    intervalMs: number;
    actions: string[];
  };
  doctor: {
    autoRepair: boolean;
    checkIntervalMs: number;
  };
  dataDir: string;
  logLevel: string;
  maxContextTokens: number;
  thinkingEnabled: boolean;
}

async function main(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║     🐴 PEGASUS — Setup Wizard         ║');
  console.log('╚═══════════════════════════════════════╝\n');

  // Ensure directories exist
  mkdirSync(join(CONFIG_DIR, 'data', 'vectors'), { recursive: true });
  mkdirSync(join(CONFIG_DIR, 'data', 'backups'), { recursive: true });
  mkdirSync(join(CONFIG_DIR, 'data', 'media'), { recursive: true });
  mkdirSync(join(CONFIG_DIR, 'rules'), { recursive: true });

  const config: WizardConfig = {
    providers: [],
    telegram: { token: '', allowedChatIds: [], rateLimitPerMinute: 30 },
    memory: {
      embeddingModel: 'openai/text-embedding-3-small',
      embeddingProvider: 'openrouter',
      maxSearchResults: 10,
      autoExtract: true,
      dreamIntervalMs: 21_600_000,
      consolidationThreshold: 0.92,
    },
    persona: { name: 'Pegasus', language: 'pt-BR', timezone: '', style: 'technical' },
    heartbeat: { enabled: true, intervalMs: 300_000, actions: ['health_check'] },
    doctor: { autoRepair: true, checkIntervalMs: 3_600_000 },
    dataDir: '~/.pegasus/data',
    logLevel: 'info',
    maxContextTokens: 12_000,
    thinkingEnabled: true,
  };

  // ═══ Step 1: User Profile ═══
  console.log('═══ ETAPA 1: Perfil do Usuário ═══\n');

  config.persona.name = (await rl.question('  📝 Nome do agente [Pegasus]: ')) || 'Pegasus';
  config.persona.language = (await rl.question('  🗣️  Idioma [pt-BR]: ')) || 'pt-BR';
  config.persona.timezone = (await rl.question('  🌍 Fuso horário [America/Sao_Paulo]: ')) || 'America/Sao_Paulo';

  // ═══ Step 2: Providers ═══
  console.log('\n═══ ETAPA 2: Provedores de IA ═══\n');

  // NVIDIA
  const nvidiaKey = await rl.question('  🟢 NVIDIA NIM API Key (Enter para pular): ');
  if (nvidiaKey.trim()) {
    const model = (await rl.question('    Modelo [meta/llama-3.1-70b-instruct]: ')) || 'meta/llama-3.1-70b-instruct';
    config.providers.push({ type: 'nvidia', apiKey: nvidiaKey.trim(), baseUrl: 'https://integrate.api.nvidia.com/v1', defaultModel: model, enabled: true });
    console.log('    ✅ NVIDIA configurado\n');
  }

  // OpenRouter
  const orKey = await rl.question('  🟣 OpenRouter API Key (Enter para pular): ');
  if (orKey.trim()) {
    const model = (await rl.question('    Modelo [anthropic/claude-3.5-sonnet]: ')) || 'anthropic/claude-3.5-sonnet';
    config.providers.push({ type: 'openrouter', apiKey: orKey.trim(), baseUrl: 'https://openrouter.ai/api/v1', defaultModel: model, enabled: true });
    console.log('    ✅ OpenRouter configurado\n');
  }

  // Gemini
  const geminiKey = await rl.question('  🔵 Google Gemini API Key (Enter para pular): ');
  if (geminiKey.trim()) {
    config.providers.push({ type: 'gemini', apiKey: geminiKey.trim(), defaultModel: 'gemini-2.5-pro', enabled: true });
    console.log('    ✅ Gemini configurado\n');
  }

  // OpenAI/Codex
  const openaiKey = await rl.question('  ⚪ OpenAI/Codex API Key (Enter para pular): ');
  if (openaiKey.trim()) {
    config.providers.push({ type: 'codex', apiKey: openaiKey.trim(), defaultModel: 'gpt-4o', enabled: true });
    console.log('    ✅ OpenAI configurado\n');
  }

  // HuggingFace
  const hfToken = await rl.question('  🟡 HuggingFace Token (para imagens, Enter para pular): ');
  if (hfToken.trim()) {
    config.providers.push({ type: 'huggingface', apiKey: hfToken.trim(), defaultModel: 'black-forest-labs/FLUX.1-dev', enabled: true });
    console.log('    ✅ HuggingFace configurado\n');
  }

  // Ollama
  const ollamaUrl = await rl.question('  🟠 Ollama URL [http://localhost:11434] (Enter para pular): ');
  if (ollamaUrl.trim()) {
    const model = (await rl.question('    Modelo [llama3.1]: ')) || 'llama3.1';
    config.providers.push({ type: 'ollama', baseUrl: ollamaUrl.trim() || 'http://localhost:11434', defaultModel: model, enabled: true });
    console.log('    ✅ Ollama configurado\n');
  }

  if (config.providers.length === 0) {
    console.log('  ⚠️  Nenhum provider configurado! Configure pelo menos 1.\n');
    rl.close();
    return;
  }

  // ═══ Step 3: Embeddings ═══
  console.log('═══ ETAPA 3: Embeddings ═══\n');

  const hasOpenRouter = config.providers.some(p => p.type === 'openrouter');
  if (hasOpenRouter) {
    config.memory.embeddingProvider = 'openrouter';
    config.memory.embeddingModel = 'openai/text-embedding-3-small';
    console.log('  ✅ Embeddings via OpenRouter (text-embedding-3-small)\n');
  } else {
    const embProvider = (await rl.question('  Provider de embedding [nvidia/openrouter/ollama]: ')) || 'nvidia';
    config.memory.embeddingProvider = embProvider as 'nvidia' | 'openrouter' | 'ollama';
    console.log(`  ✅ Embeddings via ${embProvider}\n`);
  }

  // ═══ Step 4: Telegram ═══
  console.log('═══ ETAPA 4: Telegram Bot ═══\n');

  config.telegram.token = (await rl.question('  🤖 Token do BotFather: ')).trim();
  const chatIds = (await rl.question('  💬 Chat IDs permitidos (separados por vírgula): ')).trim();
  config.telegram.allowedChatIds = chatIds.split(',').filter(Boolean).map(Number);

  // ═══ Step 5: Personality ═══
  console.log('\n═══ ETAPA 5: Personalidade ═══\n');
  console.log('  [1] 🔧 Técnico e direto');
  console.log('  [2] 😊 Amigável e casual');
  console.log('  [3] 🎨 Criativo e expressivo');
  const style = (await rl.question('  Escolha [1]: ')) || '1';
  config.persona.style = { '1': 'technical', '2': 'friendly', '3': 'creative' }[style] ?? 'technical';

  // ═══ Step 6: Features ═══
  console.log('\n═══ ETAPA 6: Funcionalidades ═══\n');

  const autoExtract = (await rl.question('  Memória automática? [Y/n]: ')) || 'Y';
  config.memory.autoExtract = autoExtract.toLowerCase() !== 'n';

  const thinking = (await rl.question('  Thinking forçado? [Y/n]: ')) || 'Y';
  config.thinkingEnabled = thinking.toLowerCase() !== 'n';

  const heartbeat = (await rl.question('  Heartbeat? [Y/n]: ')) || 'Y';
  config.heartbeat.enabled = heartbeat.toLowerCase() !== 'n';

  // ═══ Step 7: Save ═══
  console.log('\n═══ ETAPA 7: Salvando ═══\n');

  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  console.log(`  ✅ Config salva: ${CONFIG_FILE}`);

  // Copy templates if not exist
  const templates = ['instructions.md', 'persona.md', 'user.md'];
  for (const tmpl of templates) {
    const target = join(CONFIG_DIR, tmpl);
    const source = join(process.cwd(), 'templates', tmpl);
    if (!existsSync(target) && existsSync(source)) {
      copyFileSync(source, target);
      console.log(`  📄 ${tmpl} copiado`);
    }
  }

  console.log('\n✅ Setup completo!');
  console.log('  npm start        → Telegram bot');
  console.log('  npm run start:cli → CLI interativa');
  console.log('  npm run doctor   → Diagnóstico\n');

  rl.close();
}

main().catch(err => {
  console.error('Setup error:', err);
  process.exit(1);
});
