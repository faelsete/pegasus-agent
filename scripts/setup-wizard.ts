import * as readline from 'node:readline/promises';
import { writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ═══════════════════════════════════════════
// 🐴 PEGASUS — Setup Wizard (Interativo)
//
// Busca modelos dinamicamente das APIs.
// Tudo grátis por padrão.
// ═══════════════════════════════════════════

const CONFIG_DIR = join(homedir(), '.pegasus');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

interface ProviderEntry {
  type: string;
  apiKey?: string;
  apiKeys?: string[];
  baseUrl?: string;
  defaultModel?: string;
  enabled: boolean;
}

interface WizardConfig {
  providers: ProviderEntry[];
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

// ═══ Fetch Models from API ═══

interface ModelInfo {
  id: string;
  name?: string;
}

async function fetchModels(type: string, apiKey: string, baseUrl?: string): Promise<ModelInfo[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let url = '';

  switch (type) {
    case 'openrouter':
      url = 'https://openrouter.ai/api/v1/models';
      headers['Authorization'] = `Bearer ${apiKey}`;
      break;
    case 'nvidia':
      url = `${baseUrl || 'https://integrate.api.nvidia.com/v1'}/models`;
      headers['Authorization'] = `Bearer ${apiKey}`;
      break;
    case 'codex':
      url = 'https://api.openai.com/v1/models';
      headers['Authorization'] = `Bearer ${apiKey}`;
      break;
    case 'gemini':
      url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
      break;
    default:
      return [];
  }

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const json = await res.json() as Record<string, unknown>;

    if (type === 'gemini') {
      const models = (json.models as Array<{ name: string; displayName: string }>) || [];
      return models
        .filter(m => m.name.includes('gemini'))
        .map(m => ({ id: m.name.replace('models/', ''), name: m.displayName }));
    }

    if (type === 'openrouter') {
      const models = (json.data as ModelInfo[]) || [];
      return models
        .filter(m => m.id && !m.id.includes('image') && !m.id.includes('audio'))
        .sort((a, b) => a.id.localeCompare(b.id));
    }

    const models = (json.data as ModelInfo[]) || [];
    return models.sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return [];
  }
}

async function pickModel(
  rl: readline.Interface,
  type: string,
  apiKey: string,
  baseUrl: string | undefined,
  defaultModel: string,
  freeFilter?: string,
): Promise<string> {
  console.log('    🔍 Buscando modelos disponíveis...');
  const allModels = await fetchModels(type, apiKey, baseUrl);

  if (allModels.length === 0) {
    console.log('    ⚠️  Não consegui buscar modelos (API offline ou chave inválida)');
    const manual = (await rl.question(`    Modelo [${defaultModel}]: `)) || defaultModel;
    return manual;
  }

  // Apply free filter for OpenRouter
  let models = allModels;
  if (freeFilter) {
    const free = allModels.filter(m => m.id.toLowerCase().includes(freeFilter));
    if (free.length > 0) {
      console.log(`    💚 ${free.length} modelos grátis encontrados!`);
      models = free;
    }
  }

  // Show paginated list (max 20 at a time)
  const PAGE = 20;
  let page = 0;
  const totalPages = Math.ceil(models.length / PAGE);

  while (true) {
    const start = page * PAGE;
    const end = Math.min(start + PAGE, models.length);

    console.log(`\n    📋 Modelos (pág ${page + 1}/${totalPages}, total: ${models.length}):\n`);
    for (let i = start; i < end; i++) {
      const m = models[i]!;
      const isFree = m.id.includes(':free') ? ' 💚 FREE' : '';
      console.log(`      ${String(i + 1).padStart(4)}. ${m.id}${isFree}`);
    }

    let prompt = '\n    Digite o número';
    if (totalPages > 1) prompt += ', [n]ext, [p]rev';
    prompt += `, [b]uscar, ou Enter para [${defaultModel}]: `;

    const input = (await rl.question(prompt)).trim().toLowerCase();

    if (input === '') return defaultModel;
    if (input === 'n' && page < totalPages - 1) { page++; continue; }
    if (input === 'p' && page > 0) { page--; continue; }
    if (input === 'b') {
      const search = (await rl.question('    🔎 Buscar: ')).trim().toLowerCase();
      if (search) {
        models = allModels.filter(m => m.id.toLowerCase().includes(search));
        page = 0;
        console.log(`    → ${models.length} resultados`);
        if (models.length === 0) models = allModels;
      }
      continue;
    }

    const num = parseInt(input);
    if (!isNaN(num) && num >= 1 && num <= models.length) {
      return models[num - 1]!.id;
    }

    // Typed a model name directly
    if (input.includes('/')) return input;

    console.log('    ❌ Inválido. Tente de novo.');
  }
}

// ═══ Main Wizard ═══

async function main(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log(`
╔═══════════════════════════════════════════════╗
║                                               ║
║     🐴 PEGASUS — Setup Wizard                ║
║                                               ║
║     Configuração interativa completa.         ║
║     Tudo grátis por padrão. Só colar chaves.  ║
║                                               ║
╚═══════════════════════════════════════════════╝
`);

  // Ensure directories exist
  mkdirSync(join(CONFIG_DIR, 'data', 'vectors'), { recursive: true });
  mkdirSync(join(CONFIG_DIR, 'data', 'backups'), { recursive: true });
  mkdirSync(join(CONFIG_DIR, 'data', 'media'), { recursive: true });
  mkdirSync(join(CONFIG_DIR, 'rules'), { recursive: true });

  const config: WizardConfig = {
    providers: [],
    telegram: { token: '', allowedChatIds: [], rateLimitPerMinute: 30 },
    memory: {
      embeddingModel: 'nvidia/nv-embedqa-e5-v5',
      embeddingProvider: 'nvidia',
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

  // ═══════════════════════════════════════
  // ETAPA 1: Perfil
  // ═══════════════════════════════════════
  console.log('═══ ETAPA 1: Perfil do Agente ═══\n');

  config.persona.name = (await rl.question('  📝 Nome do agente [Pegasus]: ')) || 'Pegasus';
  config.persona.language = (await rl.question('  🗣️  Idioma [pt-BR]: ')) || 'pt-BR';
  config.persona.timezone = (await rl.question('  🌍 Fuso horário [America/Sao_Paulo]: ')) || 'America/Sao_Paulo';

  // ═══════════════════════════════════════
  // ETAPA 2: Provedores de IA
  // ═══════════════════════════════════════
  console.log('\n═══ ETAPA 2: Provedores de IA ═══');
  console.log('  Coloque a chave de cada provedor que quiser usar.');
  console.log('  Pode ter vários — se um cair, o bot tenta o próximo.');
  console.log('  💡 Para fallback com múltiplas contas, separe chaves com vírgula.\n');

  // --- NVIDIA ---
  console.log('  ┌─ 🟢 NVIDIA NIM (grátis em build.nvidia.com)');
  console.log('  │  💡 Múltiplas chaves? Separe com vírgula: key1,key2,key3');
  const nvidiaRaw = (await rl.question('  │  API Key(s) (Enter = pular): ')).trim();
  if (nvidiaRaw) {
    const keys = nvidiaRaw.split(',').map(k => k.trim()).filter(Boolean);
    const model = await pickModel(rl, 'nvidia', keys[0]!, 'https://integrate.api.nvidia.com/v1', 'qwen/qwen3.5-122b-a10b');
    if (keys.length > 1) {
      config.providers.push({ type: 'nvidia', apiKeys: keys, baseUrl: 'https://integrate.api.nvidia.com/v1', defaultModel: model, enabled: true });
      console.log(`  └─ ✅ NVIDIA → ${model} (${keys.length} chaves para fallback!)\n`);
    } else {
      config.providers.push({ type: 'nvidia', apiKey: keys[0], baseUrl: 'https://integrate.api.nvidia.com/v1', defaultModel: model, enabled: true });
      console.log(`  └─ ✅ NVIDIA → ${model}\n`);
    }
    config.memory.embeddingProvider = 'nvidia';
    config.memory.embeddingModel = 'nvidia/nv-embedqa-e5-v5';
  } else {
    console.log('  └─ ⏭️  Pulou\n');
  }

  // --- OpenRouter ---
  console.log('  ┌─ 🟣 OpenRouter (modelos grátis e pagos — openrouter.ai)');
  console.log('  │  💡 Tem modelos :free! Múltiplas chaves? Separe com vírgula.');
  const orRaw = (await rl.question('  │  API Key(s) (Enter = pular): ')).trim();
  if (orRaw) {
    const keys = orRaw.split(',').map(k => k.trim()).filter(Boolean);
    const model = await pickModel(rl, 'openrouter', keys[0]!, undefined, 'deepseek/deepseek-chat-v3-0324:free', ':free');
    if (keys.length > 1) {
      config.providers.push({ type: 'openrouter', apiKeys: keys, baseUrl: 'https://openrouter.ai/api/v1', defaultModel: model, enabled: true });
      console.log(`  └─ ✅ OpenRouter → ${model} (${keys.length} chaves)\n`);
    } else {
      config.providers.push({ type: 'openrouter', apiKey: keys[0], baseUrl: 'https://openrouter.ai/api/v1', defaultModel: model, enabled: true });
      console.log(`  └─ ✅ OpenRouter → ${model}\n`);
    }
  } else {
    console.log('  └─ ⏭️  Pulou\n');
  }

  // --- Gemini ---
  console.log('  ┌─ 🔵 Google Gemini (grátis com limites — aistudio.google.com)');
  console.log('  │  💡 Múltiplas contas? Separe as chaves com vírgula.');
  const geminiRaw = (await rl.question('  │  API Key(s) (Enter = pular): ')).trim();
  if (geminiRaw) {
    const keys = geminiRaw.split(',').map(k => k.trim()).filter(Boolean);
    const model = await pickModel(rl, 'gemini', keys[0]!, undefined, 'gemini-2.0-flash');
    if (keys.length > 1) {
      config.providers.push({ type: 'gemini', apiKeys: keys, defaultModel: model, enabled: true });
      console.log(`  └─ ✅ Gemini → ${model} (${keys.length} chaves para fallback!)\n`);
    } else {
      config.providers.push({ type: 'gemini', apiKey: keys[0], defaultModel: model, enabled: true });
      console.log(`  └─ ✅ Gemini → ${model}\n`);
    }
  } else {
    console.log('  └─ ⏭️  Pulou\n');
  }

  // --- OpenAI ---
  console.log('  ┌─ ⚪ OpenAI (pago — platform.openai.com)');
  const openaiKey = (await rl.question('  │  API Key (Enter = pular): ')).trim();
  if (openaiKey) {
    const model = await pickModel(rl, 'codex', openaiKey, undefined, 'gpt-4o');
    config.providers.push({ type: 'codex', apiKey: openaiKey, defaultModel: model, enabled: true });
    console.log(`  └─ ✅ OpenAI → ${model}\n`);
  } else {
    console.log('  └─ ⏭️  Pulou\n');
  }

  // --- HuggingFace ---
  console.log('  ┌─ 🟡 HuggingFace (imagens — huggingface.co)');
  const hfToken = (await rl.question('  │  Token (Enter = pular): ')).trim();
  if (hfToken) {
    config.providers.push({ type: 'huggingface', apiKey: hfToken, defaultModel: 'black-forest-labs/FLUX.1-dev', enabled: true });
    console.log('  └─ ✅ HuggingFace → FLUX.1-dev\n');
  } else {
    console.log('  └─ ⏭️  Pulou\n');
  }

  // --- Ollama ---
  console.log('  ┌─ 🟠 Ollama (local, 100% grátis — ollama.com)');
  const ollamaUrl = (await rl.question('  │  URL [http://localhost:11434] (Enter = pular): ')).trim();
  if (ollamaUrl) {
    const url = ollamaUrl || 'http://localhost:11434';
    const model = (await rl.question('  │  Modelo [llama3.1]: ')) || 'llama3.1';
    config.providers.push({ type: 'ollama', baseUrl: url, defaultModel: model, enabled: true });
    console.log(`  └─ ✅ Ollama → ${model}\n`);
  } else {
    console.log('  └─ ⏭️  Pulou\n');
  }

  // Check
  if (config.providers.length === 0) {
    console.log('  ❌ Nenhum provedor configurado! Precisa de pelo menos 1.');
    console.log('  Dica: NVIDIA é grátis — pegue a chave em build.nvidia.com\n');
    rl.close();
    return;
  }

  console.log(`  📊 ${config.providers.length} provedor(es) configurado(s)`);
  console.log(`  📊 Ordem de prioridade (fallback): ${config.providers.map(p => p.type.toUpperCase()).join(' → ')}\n`);

  // ═══════════════════════════════════════
  // ETAPA 3: Embeddings (auto)
  // ═══════════════════════════════════════
  console.log('═══ ETAPA 3: Embeddings (memória) ═══\n');

  const hasNvidia = config.providers.some(p => p.type === 'nvidia');
  if (hasNvidia) {
    config.memory.embeddingProvider = 'nvidia';
    config.memory.embeddingModel = 'nvidia/nv-embedqa-e5-v5';
    console.log('  ✅ Embeddings → NVIDIA nv-embedqa-e5-v5 (GRÁTIS!)\n');
  } else if (config.providers.some(p => p.type === 'openrouter')) {
    config.memory.embeddingProvider = 'openrouter';
    config.memory.embeddingModel = 'openai/text-embedding-3-small';
    console.log('  ✅ Embeddings → OpenRouter text-embedding-3-small (custo mínimo)\n');
  } else {
    console.log('  ⚠️  Sem provider de embeddings. Memória semântica desativada.\n');
  }

  // ═══════════════════════════════════════
  // ETAPA 4: Telegram
  // ═══════════════════════════════════════
  console.log('═══ ETAPA 4: Telegram Bot ═══');
  console.log('  Crie um bot no @BotFather e cole o token aqui.\n');

  config.telegram.token = (await rl.question('  🤖 Token do BotFather: ')).trim();

  console.log('\n  💡 Para descobrir seu Chat ID, mande /start pro @userinfobot no Telegram.');
  const chatIds = (await rl.question('  💬 Chat IDs permitidos (separados por vírgula): ')).trim();
  config.telegram.allowedChatIds = chatIds.split(',').filter(Boolean).map(Number);

  // ═══════════════════════════════════════
  // ETAPA 5: Personalidade
  // ═══════════════════════════════════════
  console.log('\n═══ ETAPA 5: Personalidade ═══\n');
  console.log('  [1] 🔧 Técnico e direto');
  console.log('  [2] 😊 Amigável e casual');
  console.log('  [3] 🎨 Criativo e expressivo');
  const style = (await rl.question('  Escolha [1]: ')) || '1';
  config.persona.style = { '1': 'technical', '2': 'friendly', '3': 'creative' }[style] ?? 'technical';

  // ═══════════════════════════════════════
  // ETAPA 6: Features
  // ═══════════════════════════════════════
  console.log('\n═══ ETAPA 6: Funcionalidades ═══\n');

  const autoExtract = (await rl.question('  🧠 Memória automática? [S/n]: ')) || 'S';
  config.memory.autoExtract = autoExtract.toLowerCase() !== 'n';

  const thinking = (await rl.question('  💭 Thinking forçado? [S/n]: ')) || 'S';
  config.thinkingEnabled = thinking.toLowerCase() !== 'n';

  const heartbeat = (await rl.question('  💓 Heartbeat? [S/n]: ')) || 'S';
  config.heartbeat.enabled = heartbeat.toLowerCase() !== 'n';

  // ═══════════════════════════════════════
  // ETAPA 7: Salvar
  // ═══════════════════════════════════════
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

  // ═══ Resumo ═══
  console.log(`
╔═══════════════════════════════════════════════╗
║  ✅ SETUP COMPLETO!                          ║
╚═══════════════════════════════════════════════╝

  Provedores: ${config.providers.map(p => `${p.type}(${p.defaultModel})`).join(', ')}
  Embeddings: ${config.memory.embeddingProvider} → ${config.memory.embeddingModel}
  Telegram:   Bot configurado
  Memória:    ${config.memory.autoExtract ? 'Automática' : 'Manual'}

  Próximos passos:
    npm start              → Rodar manual
    sudo bash scripts/service.sh install  → Rodar 24/7

  Para trocar modelo depois:
    npm run model

  Para reconfigurar:
    npm run setup
`);

  rl.close();
}

main().catch(err => {
  console.error('Setup error:', err);
  process.exit(1);
});
