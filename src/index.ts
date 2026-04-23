import { initDatabase, closeDatabase } from './db/sqlite.js';
import { initVectorStore } from './memory/store.js';
import { loadConfig } from './config/loader.js';
import { Brainstem } from './brain/brainstem.js';
import { getLogger } from './utils/logger.js';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ═══════════════════════════════════════════
// 🐴 PEGASUS — Entry Point
// ═══════════════════════════════════════════

const logger = getLogger('main');
const VERSION = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')).version as string;

async function main(): Promise<void> {
  const mode = process.argv[2] ?? 'telegram';

  console.log('');
  console.log(`  🐴 P E G A S U S  v${VERSION}`);
  console.log('  ─────────────────────────');
  console.log('');

  switch (mode) {
    case 'setup': {
      // Setup wizard runs as separate process
      const { execSync } = await import('node:child_process');
      execSync('npx tsx scripts/setup-wizard.ts', { stdio: 'inherit' });
      return;
    }

    case 'doctor': {
      loadConfig();
      const { runDoctor } = await import('./doctor/index.js');
      await runDoctor();
      return;
    }

    default:
      break;
  }

  // Load and validate configuration
  const config = loadConfig();
  logger.info({ mode, providers: config.providers.length }, 'config loaded');

  // Initialize databases
  initDatabase();
  await initVectorStore();
  logger.info('databases initialized');

  // Start autonomic systems
  const brainstem = new Brainstem();

  switch (mode) {
    case 'telegram': {
      const { createBot } = await import('./interfaces/telegram.js');
      const bot = createBot(config);

      // Connect brainstem to Telegram for notifications
      brainstem.setNotifier(async (msg) => {
        for (const chatId of config.telegram.allowedChatIds) {
          await bot.api.sendMessage(chatId, msg, { parse_mode: 'Markdown' }).catch(() => {});
        }
      });

      brainstem.start();
      logger.info('starting Telegram bot (long-polling)');
      bot.start();
      break;
    }

    case 'cli': {
      const { startCli } = await import('./interfaces/cli.js');
      brainstem.start();
      await startCli();
      brainstem.stop();
      break;
    }

    default:
      console.error(`Unknown mode: ${mode}. Use: telegram | cli | doctor | setup`);
      process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('shutting down...');
  closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('terminated');
  closeDatabase();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error({ err: err.message, stack: err.stack }, 'uncaught exception (recovered)');
  // DON'T exit — let the process survive
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  logger.error({ reason: msg }, 'unhandled rejection (recovered)');
  // DON'T exit — let the process survive
});

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
