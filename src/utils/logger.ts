import pino from 'pino';
import { getConfig } from '../config/loader.js';

// ═══════════════════════════════════════════
// Structured Logger (pino)
// ═══════════════════════════════════════════

let rootLogger: pino.Logger | null = null;

function createRootLogger(): pino.Logger {
  let level: string;
  try {
    level = getConfig().logLevel;
  } catch {
    level = 'info';
  }

  return pino({
    level,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  });
}

export function getLogger(module: string): pino.Logger {
  if (!rootLogger) {
    rootLogger = createRootLogger();
  }
  return rootLogger.child({ module });
}
