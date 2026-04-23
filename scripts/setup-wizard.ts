import * as readline from 'node:readline/promises';
import { writeFileSync, mkdirSync, existsSync, readFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ═══════════════════════════════════════════
// 🐴 PEGASUS — Setup Wizard v2
//
// 3 modos: Manter | Atualizar | Resetar
// Versionamento por data: 2026_04_23
// ═══════════════════════════════════════════

const CONFIG_DIR = join(homedir(), '.pegasus');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const VERSION = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')).version as string;

type SetupMode = 'keep' | 'update' | 'reset';

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
  telegram: { token: string; allowedChatIds: number[]; rateLimitPerMinute: number };
  memory: { embeddingModel: string; embeddingProvider: string; maxSearchResults: number; autoExtract: boolean; dreamIntervalMs: number; consolidationThreshold: number };
  persona: { name: string; language: string; timezone: string; style: string };
  heartbeat: { enabled: boolean; intervalMs: number; actions: string[] };
  doctor: { autoRepair: boolean; checkIntervalMs: number };
  dataDir: string;
  logLevel: string;
  maxContextTokens: number;
  thinkingEnabled: boolean;
}

function getDefaults(): WizardConfig {
  return {
    providers: [],
    telegram: { token: '', allowedChatIds: [], rateLimitPerMinute: 30 },
    memory: { embeddingModel: 'nvidia/nv-embedqa-e5-v5', embeddingProvider: 'nvidia', maxSearchResults: 10, autoExtract: true, dreamIntervalMs: 21_600_000, consolidationThreshold: 0.92 },
    persona: { name: 'Pegasus', language: 'pt-BR', timezone: 'America/Sao_Paulo', style: 'technical' },
    heartbeat: { enabled: true, intervalMs: 300_000, actions: ['health_check'] },
    doctor: { autoRepair: true, checkIntervalMs: 3_600_000 },
    dataDir: '~/.pegasus/data', logLevel: 'info', maxContextTokens: 12_000, thinkingEnabled: true,
  };
}

function loadExisting(): WizardConfig | null {
  if (!existsSync(CONFIG_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) as WizardConfig;
  } catch { return null; }
}

// ═══ Fetch Models from API ═══

interface ModelInfo { id: string; name?: string }

async function fetchModels(type: string, apiKey: string, baseUrl?: string): Promise<ModelInfo[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let url = '';
  switch (type) {
    case 'openrouter': url = 'https://openrouter.ai/api/v1/models'; headers['Authorization'] = `Bearer ${apiKey}`; break;
    case 'nvidia': url = `${baseUrl || 'https://integrate.api.nvidia.com/v1'}/models`; headers['Authorization'] = `Bearer ${apiKey}`; break;
    case 'codex': url = 'https://api.openai.com/v1/models'; headers['Authorization'] = `Bearer ${apiKey}`; break;
    case 'gemini': url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`; break;
    default: return [];
  }
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const json = await res.json() as Record<string, unknown>;
    if (type === 'gemini') {
      const models = (json.models as Array<{ name: string; displayName: string }>) || [];
      return models.filter(m => m.name.includes('gemini')).map(m => ({ id: m.name.replace('models/', ''), name: m.displayName }));
    }
    if (type === 'openrouter') {
      const models = (json.data as ModelInfo[]) || [];
      return models.filter(m => m.id && !m.id.includes('image') && !m.id.includes('audio')).sort((a, b) => a.id.localeCompare(b.id));
    }
    return ((json.data as ModelInfo[]) || []).sort((a, b) => a.id.localeCompare(b.id));
  } catch { return []; }
}

async function pickModel(rl: readline.Interface, type: string, apiKey: string, baseUrl: string | undefined, defaultModel: string, freeFilter?: string): Promise<string> {
  console.log('    🔍 Buscando modelos disponíveis...');
  const allModels = await fetchModels(type, apiKey, baseUrl);
  if (allModels.length === 0) {
    const manual = (await rl.question(`    Modelo [${defaultModel}]: `)) || defaultModel;
    return manual;
  }
  let models = allModels;
  if (freeFilter) {
    const free = allModels.filter(m => m.id.toLowerCase().includes(freeFilter));
    if (free.length > 0) { console.log(`    💚 ${free.length} modelos grátis!`); models = free; }
  }
  const PAGE = 20;
  let page = 0;
  const totalPages = Math.ceil(models.length / PAGE);
  while (true) {
    const start = page * PAGE;
    const end = Math.min(start + PAGE, models.length);
    console.log(`\n    📋 Modelos (pág ${page + 1}/${totalPages}, total: ${models.length}):\n`);
    for (let i = start; i < end; i++) {
      const m = models[i]!;
      const isFree = m.id.includes(':free') ? ' 💚' : '';
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
      if (search) { models = allModels.filter(m => m.id.toLowerCase().includes(search)); page = 0; if (models.length === 0) models = allModels; }
      continue;
    }
    const num = parseInt(input);
    if (!isNaN(num) && num >= 1 && num <= models.length) return models[num - 1]!.id;
    if (input.includes('/')) return input;
    console.log('    ❌ Inválido.');
  }
}

// ═══ Provider Setup (shared between modes) ═══

async function setupProvider(
  rl: readline.Interface, label: string, type: string, existing: ProviderEntry | undefined,
  mode: SetupMode, defaultModel: string, baseUrl?: string, freeFilter?: string,
): Promise<ProviderEntry | null> {
  const hasExisting = existing && (existing.apiKey || (existing.apiKeys && existing.apiKeys.length > 0));
  const existingKeys = existing?.apiKeys ?? (existing?.apiKey ? [existing.apiKey] : []);
  const existingModel = existing?.defaultModel ?? defaultModel;

  if (mode === 'keep' && hasExisting) {
    console.log(`  │  ✅ Já configurado: ${existingModel} (${existingKeys.length} chave(s))`);
    console.log(`  │  💡 Adicionar mais chaves? Separe com vírgula.`);
  } else if (mode === 'update' && hasExisting) {
    console.log(`  │  Atual: ${existingModel} (${existingKeys.length} chave(s))`);
    console.log(`  │  Enter = manter atual. Nova chave = substituir.`);
  }

  const rawInput = (await rl.question(`  │  API Key(s) (Enter = ${hasExisting ? 'manter' : 'pular'}): `)).trim();

  if (!rawInput && !hasExisting) {
    console.log('  └─ ⏭️  Pulou\n');
    return null;
  }

  let keys: string[];
  if (!rawInput && hasExisting) {
    // Keep existing
    keys = existingKeys;
  } else if (rawInput && mode === 'keep' && hasExisting) {
    // MERGE: add new keys to existing
    const newKeys = rawInput.split(',').map(k => k.trim()).filter(Boolean);
    const merged = [...new Set([...existingKeys, ...newKeys])];
    keys = merged;
    console.log(`  │  🔗 Merge: ${existingKeys.length} existentes + ${newKeys.length} novas = ${merged.length} total`);
  } else {
    // Replace or new
    keys = rawInput.split(',').map(k => k.trim()).filter(Boolean);
  }

  if (keys.length === 0) {
    console.log('  └─ ⏭️  Sem chave válida\n');
    return null;
  }

  // Model selection
  let model = existingModel;
  if (mode === 'reset' || !hasExisting || rawInput) {
    model = await pickModel(rl, type, keys[0]!, baseUrl, existingModel, freeFilter);
  } else if (mode === 'update') {
    const newModel = (await rl.question(`  │  Modelo [${existingModel}]: `)).trim();
    if (newModel) model = newModel;
  }

  const entry: ProviderEntry = { type, enabled: true, defaultModel: model };
  if (baseUrl) entry.baseUrl = baseUrl;
  if (keys.length > 1) {
    entry.apiKeys = keys;
  } else {
    entry.apiKey = keys[0];
  }

  console.log(`  └─ ✅ ${label} → ${model} (${keys.length} chave(s))\n`);
  return entry;
}

// ═══ Main Wizard ═══

async function main(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log(`
╔═══════════════════════════════════════════════╗
║                                               ║
║     🐴 PEGASUS — Setup Wizard                ║
║     Versão: ${VERSION.padEnd(33)}║
║                                               ║
╚═══════════════════════════════════════════════╝
`);

  mkdirSync(join(CONFIG_DIR, 'data', 'vectors'), { recursive: true });
  mkdirSync(join(CONFIG_DIR, 'data', 'backups'), { recursive: true });
  mkdirSync(join(CONFIG_DIR, 'data', 'media'), { recursive: true });

  // ═══ Mode Selection ═══
  const existing = loadExisting();
  let mode: SetupMode = 'reset';
  let config: WizardConfig;

  if (existing && existing.providers && existing.providers.length > 0) {
    console.log('  📦 Configuração existente encontrada!\n');
    console.log(`  Provedores: ${existing.providers.map(p => `${p.type}(${p.defaultModel})`).join(', ')}`);
    console.log(`  Telegram: ${existing.telegram?.token ? '✅ configurado' : '❌ não configurado'}\n`);

    console.log('  [1] 🔒 MANTER — Mantém tudo, só adiciona o que for novo');
    console.log('  [2] 🔄 ATUALIZAR — Atualiza só o que você preencher (Enter = manter)');
    console.log('  [3] 💥 RESETAR — Apaga tudo, começa do zero absoluto\n');

    const choice = (await rl.question('  Escolha [1/2/3]: ')).trim();
    mode = choice === '2' ? 'update' : choice === '3' ? 'reset' : 'keep';
    console.log(`\n  → Modo: ${mode === 'keep' ? '🔒 MANTER' : mode === 'update' ? '🔄 ATUALIZAR' : '💥 RESETAR'}\n`);
  } else {
    console.log('  🆕 Primeira configuração — vamos começar!\n');
  }

  config = mode === 'reset' ? getDefaults() : { ...getDefaults(), ...existing! };
  if (mode !== 'reset' && existing) {
    config.providers = [...existing.providers]; // preserve provider array
  }

  // ═══ ETAPA 1: Perfil ═══
  console.log('═══ ETAPA 1: Perfil do Agente ═══\n');
  if (mode === 'reset') {
    config.persona.name = (await rl.question('  📝 Nome [Pegasus]: ')) || 'Pegasus';
    config.persona.language = (await rl.question('  🗣️  Idioma [pt-BR]: ')) || 'pt-BR';
    config.persona.timezone = (await rl.question('  🌍 Fuso [America/Sao_Paulo]: ')) || 'America/Sao_Paulo';
  } else {
    const name = (await rl.question(`  📝 Nome [${config.persona.name}]: `)).trim();
    if (name) config.persona.name = name;
    const lang = (await rl.question(`  🗣️  Idioma [${config.persona.language}]: `)).trim();
    if (lang) config.persona.language = lang;
    const tz = (await rl.question(`  🌍 Fuso [${config.persona.timezone}]: `)).trim();
    if (tz) config.persona.timezone = tz;
  }

  // ═══ ETAPA 2: Provedores ═══
  console.log('\n═══ ETAPA 2: Provedores de IA ═══');
  console.log('  Coloque a chave de cada provedor que quiser usar.');
  if (mode === 'keep') console.log('  💡 Modo MANTER: novas chaves são SOMADAS às existentes.');
  if (mode === 'update') console.log('  💡 Modo ATUALIZAR: Enter = manter atual, nova chave = substituir.');
  console.log('  💡 Múltiplas chaves? Separe com vírgula: key1,key2,key3\n');

  const newProviders: ProviderEntry[] = [];
  const existingProviders = mode === 'reset' ? [] : config.providers;

  const providerDefs = [
    { label: '🟢 NVIDIA NIM', type: 'nvidia', defaultModel: 'qwen/qwen3.5-122b-a10b', baseUrl: 'https://integrate.api.nvidia.com/v1' },
    { label: '🟣 OpenRouter', type: 'openrouter', defaultModel: 'deepseek/deepseek-chat-v3-0324:free', freeFilter: ':free' },
    { label: '🔵 Google Gemini', type: 'gemini', defaultModel: 'gemini-2.0-flash' },
    { label: '⚪ OpenAI', type: 'codex', defaultModel: 'gpt-4o' },
    { label: '🟡 HuggingFace', type: 'huggingface', defaultModel: 'black-forest-labs/FLUX.1-dev' },
  ];

  for (const def of providerDefs) {
    console.log(`  ┌─ ${def.label}`);
    const existingP = existingProviders.find(p => p.type === def.type);
    const entry = await setupProvider(rl, def.label, def.type, existingP, mode, def.defaultModel, def.baseUrl, def.freeFilter);
    if (entry) {
      newProviders.push(entry);
    } else if (existingP && mode !== 'reset') {
      newProviders.push(existingP); // preserve existing if not changed
    }
  }

  // Ollama (special — url based)
  console.log('  ┌─ 🟠 Ollama (local)');
  const existingOllama = existingProviders.find(p => p.type === 'ollama');
  if (existingOllama && mode !== 'reset') {
    console.log(`  │  Atual: ${existingOllama.defaultModel} em ${existingOllama.baseUrl}`);
  }
  const ollamaUrl = (await rl.question(`  │  URL [${existingOllama?.baseUrl ?? 'Enter = pular'}]: `)).trim();
  if (ollamaUrl) {
    const model = (await rl.question('  │  Modelo [llama3.1]: ')) || 'llama3.1';
    newProviders.push({ type: 'ollama', baseUrl: ollamaUrl, defaultModel: model, enabled: true });
    console.log(`  └─ ✅ Ollama → ${model}\n`);
  } else if (existingOllama && mode !== 'reset') {
    newProviders.push(existingOllama);
    console.log('  └─ ✅ Mantido\n');
  } else {
    console.log('  └─ ⏭️  Pulou\n');
  }

  config.providers = newProviders;

  if (config.providers.length === 0) {
    console.log('  ❌ Nenhum provedor! Precisa de pelo menos 1.');
    rl.close();
    return;
  }

  console.log(`  📊 ${config.providers.length} provedor(es): ${config.providers.map(p => p.type.toUpperCase()).join(' → ')}\n`);

  // ═══ ETAPA 3: Embeddings ═══
  console.log('═══ ETAPA 3: Embeddings ═══\n');
  const hasNvidia = config.providers.some(p => p.type === 'nvidia');
  if (hasNvidia) {
    config.memory.embeddingProvider = 'nvidia';
    config.memory.embeddingModel = 'nvidia/nv-embedqa-e5-v5';
    console.log('  ✅ NVIDIA nv-embedqa-e5-v5 (GRÁTIS!)\n');
  } else if (config.providers.some(p => p.type === 'openrouter')) {
    config.memory.embeddingProvider = 'openrouter';
    config.memory.embeddingModel = 'openai/text-embedding-3-small';
    console.log('  ✅ OpenRouter text-embedding-3-small\n');
  } else {
    console.log('  ⚠️  Sem provider de embeddings\n');
  }

  // ═══ ETAPA 4: Telegram ═══
  console.log('═══ ETAPA 4: Telegram Bot ═══\n');
  const existingToken = config.telegram?.token;
  if (existingToken && mode !== 'reset') {
    console.log(`  Atual: ${existingToken.slice(0, 10)}...${existingToken.slice(-5)}`);
    const newToken = (await rl.question('  🤖 Novo token (Enter = manter): ')).trim();
    if (newToken) config.telegram.token = newToken;
  } else {
    config.telegram.token = (await rl.question('  🤖 Token do BotFather: ')).trim();
  }

  const existingIds = config.telegram?.allowedChatIds ?? [];
  if (existingIds.length > 0 && mode !== 'reset') {
    console.log(`  IDs atuais: ${existingIds.join(', ')}`);
    const newIds = (await rl.question('  💬 Chat IDs (Enter = manter, ou novos IDs): ')).trim();
    if (newIds) {
      if (mode === 'keep') {
        const parsed = newIds.split(',').filter(Boolean).map(Number);
        config.telegram.allowedChatIds = [...new Set([...existingIds, ...parsed])];
        console.log(`  🔗 Merge: ${config.telegram.allowedChatIds.length} IDs total`);
      } else {
        config.telegram.allowedChatIds = newIds.split(',').filter(Boolean).map(Number);
      }
    }
  } else {
    console.log('  💡 Chat ID: mande /start pro @userinfobot no Telegram.');
    const ids = (await rl.question('  💬 Chat IDs (separados por vírgula): ')).trim();
    config.telegram.allowedChatIds = ids.split(',').filter(Boolean).map(Number);
  }

  // ═══ ETAPA 5: Personalidade ═══
  console.log('\n═══ ETAPA 5: Personalidade ═══\n');
  console.log('  [1] 🔧 Técnico   [2] 😊 Amigável   [3] 🎨 Criativo');
  const currentStyle = config.persona.style === 'friendly' ? '2' : config.persona.style === 'creative' ? '3' : '1';
  const style = (await rl.question(`  Escolha [${currentStyle}]: `)) || currentStyle;
  config.persona.style = { '1': 'technical', '2': 'friendly', '3': 'creative' }[style] ?? 'technical';

  // ═══ ETAPA 6: Features ═══
  console.log('\n═══ ETAPA 6: Funcionalidades ═══\n');
  const ae = (await rl.question(`  🧠 Memória auto? [${config.memory.autoExtract ? 'S' : 'n'}]: `)) || (config.memory.autoExtract ? 'S' : 'n');
  config.memory.autoExtract = ae.toLowerCase() !== 'n';
  const th = (await rl.question(`  💭 Thinking? [${config.thinkingEnabled ? 'S' : 'n'}]: `)) || (config.thinkingEnabled ? 'S' : 'n');
  config.thinkingEnabled = th.toLowerCase() !== 'n';
  const hb = (await rl.question(`  💓 Heartbeat? [${config.heartbeat.enabled ? 'S' : 'n'}]: `)) || (config.heartbeat.enabled ? 'S' : 'n');
  config.heartbeat.enabled = hb.toLowerCase() !== 'n';

  // ═══ ETAPA 7: Salvar ═══
  console.log('\n═══ ETAPA 7: Salvando ═══\n');
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  console.log(`  ✅ Config salva: ${CONFIG_FILE}`);

  const templates = ['instructions.md', 'persona.md', 'user.md'];
  for (const tmpl of templates) {
    const target = join(CONFIG_DIR, tmpl);
    const source = join(process.cwd(), 'templates', tmpl);
    if (!existsSync(target) && existsSync(source)) {
      copyFileSync(source, target);
      console.log(`  📄 ${tmpl} copiado`);
    }
  }

  console.log(`
╔═══════════════════════════════════════════════╗
║  ✅ SETUP COMPLETO! (v${VERSION})${' '.repeat(Math.max(0, 22 - VERSION.length))}║
╚═══════════════════════════════════════════════╝

  Modo:       ${mode === 'keep' ? '🔒 Manter' : mode === 'update' ? '🔄 Atualizar' : '💥 Reset'}
  Provedores: ${config.providers.map(p => `${p.type}(${p.defaultModel})`).join(', ')}
  Telegram:   ${config.telegram.token ? '✅' : '❌'}
  Thinking:   ${config.thinkingEnabled ? 'ON' : 'OFF'}

  Próximos passos:
    npm start                            → Rodar manual
    sudo bash scripts/service.sh install → Rodar 24/7
`);

  rl.close();
}

main().catch(err => { console.error('Setup error:', err); process.exit(1); });
