import * as readline from 'node:readline/promises';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ═══════════════════════════════════════════
// 🐴 PEGASUS — Trocar Modelo (Interativo)
//
// Busca modelos disponíveis na API e deixa
// trocar com um número. Sem editar JSON.
//
// npm run model
// ═══════════════════════════════════════════

const CONFIG_FILE = join(homedir(), '.pegasus', 'config.json');

interface Provider {
  type: string;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  enabled: boolean;
}

interface Config {
  providers: Provider[];
  [key: string]: unknown;
}

interface ModelInfo {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
}

async function fetchModels(provider: Provider): Promise<ModelInfo[]> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  let url = '';

  switch (provider.type) {
    case 'openrouter':
      url = 'https://openrouter.ai/api/v1/models';
      if (provider.apiKey) headers['Authorization'] = `Bearer ${provider.apiKey}`;
      break;
    case 'nvidia':
      url = `${provider.baseUrl || 'https://integrate.api.nvidia.com/v1'}/models`;
      if (provider.apiKey) headers['Authorization'] = `Bearer ${provider.apiKey}`;
      break;
    case 'codex':
      url = 'https://api.openai.com/v1/models';
      if (provider.apiKey) headers['Authorization'] = `Bearer ${provider.apiKey}`;
      break;
    case 'gemini':
      url = `https://generativelanguage.googleapis.com/v1beta/models?key=${provider.apiKey}`;
      break;
    case 'ollama':
      url = `${provider.baseUrl || 'http://localhost:11434'}/api/tags`;
      break;
    default:
      return [];
  }

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.log(`    ⚠️  Erro ${res.status}: ${res.statusText}`);
      return [];
    }
    const json = await res.json() as Record<string, unknown>;

    if (provider.type === 'gemini') {
      const models = (json.models as Array<{ name: string; displayName: string }>) || [];
      return models
        .filter(m => m.name.includes('gemini'))
        .map(m => ({ id: m.name.replace('models/', ''), name: m.displayName }));
    }

    if (provider.type === 'ollama') {
      const models = (json.models as Array<{ name: string }>) || [];
      return models.map(m => ({ id: m.name, name: m.name }));
    }

    if (provider.type === 'openrouter') {
      const models = (json.data as ModelInfo[]) || [];
      // Filter: only free or cheap text models, sort by name
      return models
        .filter(m => m.id && !m.id.includes('image') && !m.id.includes('audio'))
        .sort((a, b) => a.id.localeCompare(b.id));
    }

    const models = (json.data as ModelInfo[]) || [];
    return models.sort((a, b) => a.id.localeCompare(b.id));
  } catch (err) {
    console.log(`    ⚠️  Não consegui conectar: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

function printModelList(models: ModelInfo[], current: string, page: number, pageSize: number): number {
  const start = page * pageSize;
  const end = Math.min(start + pageSize, models.length);
  const totalPages = Math.ceil(models.length / pageSize);

  console.log(`\n  📋 Modelos disponíveis (página ${page + 1}/${totalPages}, total: ${models.length}):\n`);

  for (let i = start; i < end; i++) {
    const m = models[i]!;
    const isCurrent = m.id === current;
    const marker = isCurrent ? ' ◄ ATUAL' : '';
    const pricing = m.pricing?.prompt ? ` ($${m.pricing.prompt}/tok)` : '';
    const ctx = m.context_length ? ` [${Math.round(m.context_length / 1000)}k ctx]` : '';

    if (isCurrent) {
      console.log(`  \x1b[32m  ${String(i + 1).padStart(3)}. ${m.id}${ctx}${pricing}${marker}\x1b[0m`);
    } else {
      console.log(`    ${String(i + 1).padStart(3)}. ${m.id}${ctx}${pricing}`);
    }
  }

  return totalPages;
}

async function main(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║  🐴 PEGASUS — Trocar Modelo de IA     ║');
  console.log('╚═══════════════════════════════════════╝');

  if (!existsSync(CONFIG_FILE)) {
    console.log('\n  ❌ Config não encontrada. Execute primeiro: npm run setup\n');
    rl.close();
    return;
  }

  const config: Config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  const enabledProviders = config.providers.filter(p => p.enabled);

  if (enabledProviders.length === 0) {
    console.log('\n  ❌ Nenhum provider habilitado. Execute: npm run setup\n');
    rl.close();
    return;
  }

  // Show current config
  console.log('\n  📊 Configuração atual:\n');
  for (const [i, p] of enabledProviders.entries()) {
    const priority = i === 0 ? ' ⭐ PRINCIPAL' : ` #${i + 1}`;
    console.log(`    ${p.type.toUpperCase().padEnd(12)} → ${p.defaultModel || '(sem modelo)'}${priority}`);
  }

  // Choose provider
  console.log('\n  Qual provider quer alterar?\n');
  for (const [i, p] of enabledProviders.entries()) {
    console.log(`    [${i + 1}] ${p.type.toUpperCase()} (modelo atual: ${p.defaultModel || 'nenhum'})`);
  }
  console.log(`    [0] Sair`);

  const choice = await rl.question('\n  Escolha: ');
  const providerIdx = parseInt(choice) - 1;

  if (isNaN(providerIdx) || providerIdx < 0 || providerIdx >= enabledProviders.length) {
    console.log('\n  👋 Saindo sem alterações.\n');
    rl.close();
    return;
  }

  const provider = enabledProviders[providerIdx]!;
  console.log(`\n  🔍 Buscando modelos disponíveis em ${provider.type.toUpperCase()}...`);

  const models = await fetchModels(provider);

  if (models.length === 0) {
    console.log('  ❌ Nenhum modelo encontrado (API pode estar offline).\n');
    const manual = await rl.question('  Digite o nome do modelo manualmente (ou Enter para cancelar): ');
    if (manual.trim()) {
      provider.defaultModel = manual.trim();
      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
      console.log(`\n  ✅ Modelo alterado para: ${manual.trim()}`);
      console.log('  🔄 Reinicie o serviço: sudo systemctl restart pegasus\n');
    }
    rl.close();
    return;
  }

  // Interactive pagination
  const PAGE_SIZE = 20;
  let currentPage = 0;

  // If OpenRouter, offer to filter
  let filteredModels = models;
  if (provider.type === 'openrouter' && models.length > 50) {
    console.log(`\n  ${models.length} modelos encontrados. Quer filtrar?`);
    const filter = await rl.question('  🔎 Buscar (ex: "llama", "claude", "free") ou Enter para ver todos: ');
    if (filter.trim()) {
      const q = filter.trim().toLowerCase();
      filteredModels = models.filter(m =>
        m.id.toLowerCase().includes(q) ||
        (m.name && m.name.toLowerCase().includes(q)) ||
        (q === 'free' && m.pricing?.prompt === '0')
      );
      console.log(`  → ${filteredModels.length} resultados para "${filter.trim()}"`);
    }
  }

  let choosing = true;
  while (choosing) {
    const totalPages = printModelList(filteredModels, provider.defaultModel || '', currentPage, PAGE_SIZE);

    let prompt = '\n  Digite o número do modelo';
    if (totalPages > 1) {
      prompt += ', [n] próxima página, [p] anterior';
    }
    prompt += ', [b] buscar, [0] cancelar: ';

    const input = await rl.question(prompt);
    const trimmed = input.trim().toLowerCase();

    if (trimmed === '0' || trimmed === 'q') {
      choosing = false;
      console.log('\n  👋 Sem alterações.\n');
    } else if (trimmed === 'n' && currentPage < totalPages - 1) {
      currentPage++;
    } else if (trimmed === 'p' && currentPage > 0) {
      currentPage--;
    } else if (trimmed === 'b') {
      const search = await rl.question('  🔎 Buscar: ');
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        filteredModels = models.filter(m =>
          m.id.toLowerCase().includes(q) ||
          (m.name && m.name.toLowerCase().includes(q))
        );
        currentPage = 0;
        console.log(`  → ${filteredModels.length} resultados`);
      }
    } else {
      const num = parseInt(trimmed);
      if (!isNaN(num) && num >= 1 && num <= filteredModels.length) {
        const selected = filteredModels[num - 1]!;
        provider.defaultModel = selected.id;

        // Find in original config and update
        const originalIdx = config.providers.findIndex(p => p.type === provider.type);
        if (originalIdx >= 0) {
          config.providers[originalIdx]!.defaultModel = selected.id;
        }

        writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');

        console.log(`\n  ✅ Modelo alterado: ${selected.id}`);
        console.log('  🔄 Reinicie o serviço: sudo systemctl restart pegasus\n');

        const restart = await rl.question('  Reiniciar agora? [S/n]: ');
        if (restart.toLowerCase() !== 'n') {
          const { execSync } = await import('node:child_process');
          try {
            execSync('systemctl restart pegasus', { stdio: 'inherit' });
            console.log('\n  ✅ Pegasus reiniciado com o novo modelo!\n');
          } catch {
            console.log('\n  ⚠️  Não consegui reiniciar (tente: sudo systemctl restart pegasus)\n');
          }
        }
        choosing = false;
      } else {
        console.log('  ❌ Número inválido');
      }
    }
  }

  rl.close();
}

main().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
