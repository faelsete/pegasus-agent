import * as readline from 'node:readline/promises';
import crypto from 'node:crypto';
import chalk from 'chalk';
import { reason } from '../brain/cortex.js';
import { searchRelevantContext } from '../memory/search.js';
import { addMemory, getMemoryCount } from '../memory/store.js';
import { getConfig } from '../config/loader.js';
import type { CoreMessage } from 'ai';

// ═══════════════════════════════════════════
// CLI Interface (readline + chalk)
// ═══════════════════════════════════════════

const history: CoreMessage[] = [];
let conversationId = crypto.randomUUID();

export async function startCli(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(chalk.cyan.bold('\n🐴 Pegasus CLI'));
  console.log(chalk.dim('Digite /help para comandos, "exit" para sair\n'));

  while (true) {
    const input = await rl.question(chalk.green.bold('you → '));
    const trimmed = input.trim();

    if (!trimmed) continue;
    if (trimmed === 'exit' || trimmed === 'quit') {
      console.log(chalk.dim('👋 Até mais!'));
      break;
    }

    // Handle slash commands
    if (trimmed.startsWith('/')) {
      await handleCommand(trimmed);
      continue;
    }

    // Process with Cortex
    process.stdout.write(chalk.dim('  thinking... '));

    try {
      const result = await reason({
        userMessage: trimmed,
        conversationHistory: history,
        userId: 'cli-user',
        conversationId,
      });

      // Clear "thinking..." line
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);

      // Show response
      console.log(chalk.cyan.bold('pegasus → ') + result.response);

      if (result.toolsUsed.length > 0) {
        console.log(chalk.dim(`  🔧 tools: ${result.toolsUsed.join(', ')}`));
      }
      console.log();

      // Update history
      history.push({ role: 'user', content: trimmed });
      history.push({ role: 'assistant', content: result.response });

      // Keep history manageable
      if (history.length > 40) {
        history.splice(0, 2);
      }
    } catch (error) {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      console.log(chalk.red('⚠️ Erro: ') + (error instanceof Error ? error.message : String(error)));
      console.log();
    }
  }

  rl.close();
}

async function handleCommand(cmd: string): Promise<void> {
  const [command, ...args] = cmd.split(' ');
  const arg = args.join(' ').trim();

  switch (command) {
    case '/help':
      console.log(chalk.cyan(`
🐴 Pegasus — Comandos CLI

  /status          Status do sistema
  /search <query>  Busca na memória
  /remember <fato> Salva memória
  /forget          Limpa contexto
  /model           Modelo atual
  /doctor          Diagnóstico
  /help            Este menu
  exit             Sair
`));
      break;

    case '/status': {
      const config = getConfig();
      const memCount = await getMemoryCount();
      const uptime = process.uptime();
      console.log(chalk.cyan(`
🐴 Status
  💾 Memórias: ${memCount}
  ⏱️  Uptime: ${Math.floor(uptime / 60)}min
  🧠 Providers: ${config.providers.filter(p => p.enabled).length}
  💬 Msgs: ${history.length / 2}
`));
      break;
    }

    case '/search': {
      if (!arg) {
        console.log(chalk.yellow('  Uso: /search <query>'));
        break;
      }
      const results = await searchRelevantContext(arg);
      if (results.length === 0) {
        console.log(chalk.dim('  🔍 Nenhuma memória encontrada.\n'));
      } else {
        console.log(chalk.cyan('\n  🔍 Memórias:'));
        for (const [i, r] of results.slice(0, 5).entries()) {
          console.log(chalk.dim(`  ${i + 1}. [${r.type}] `) + r.text.slice(0, 120));
        }
        console.log();
      }
      break;
    }

    case '/remember': {
      if (!arg) {
        console.log(chalk.yellow('  Uso: /remember <fato>'));
        break;
      }
      await addMemory(arg, 'fact', { source: 'manual', importance: 0.9 });
      console.log(chalk.green(`  ✅ Salvo: "${arg.slice(0, 80)}"\n`));
      break;
    }

    case '/forget':
      history.length = 0;
      conversationId = crypto.randomUUID();
      console.log(chalk.dim('  🔄 Contexto resetado.\n'));
      break;

    case '/model': {
      const config = getConfig();
      const provider = config.providers.find(p => p.enabled);
      console.log(chalk.cyan(`  🤖 ${provider?.type}/${provider?.defaultModel ?? 'default'}\n`));
      break;
    }

    case '/doctor':
      console.log(chalk.yellow('  🔧 Doctor disponível via: npm run doctor\n'));
      break;

    default:
      console.log(chalk.yellow(`  Comando desconhecido: ${command}. Use /help\n`));
  }
}
