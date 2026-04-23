import cron from 'node-cron';
import { getDb } from '../db/sqlite.js';
import { getConfig } from '../config/loader.js';
import { getLogger } from '../utils/logger.js';

// ═══════════════════════════════════════════
// Brainstem — Heartbeat + Cron + Auto-Backup
// ═══════════════════════════════════════════

const logger = getLogger('brainstem');

export class Brainstem {
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private dreamTimer: NodeJS.Timeout | null = null;
  private cronJobs = new Map<string, cron.ScheduledTask>();
  private notifyFn: ((msg: string) => Promise<void>) | null = null;

  /** Set notification function (Telegram push) */
  setNotifier(fn: (msg: string) => Promise<void>): void {
    this.notifyFn = fn;
  }

  /** Start all autonomic systems */
  start(): void {
    const config = getConfig();

    // Heartbeat
    if (config.heartbeat.enabled) {
      this.heartbeatTimer = setInterval(() => this.heartbeat(), config.heartbeat.intervalMs);
      logger.info({ intervalMs: config.heartbeat.intervalMs }, 'heartbeat started');
    }

    // Dream (memory consolidation)
    this.dreamTimer = setInterval(() => this.dream(), config.memory.dreamIntervalMs);
    logger.info({ intervalMs: config.memory.dreamIntervalMs }, 'dream cycle started');

    // Load persisted cron jobs
    this.loadCronJobs();

    // Auto-backup at 3am daily
    cron.schedule('0 3 * * *', () => this.backup());

    logger.info('brainstem started');
  }

  /** Stop all systems */
  stop(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.dreamTimer) clearInterval(this.dreamTimer);
    for (const job of this.cronJobs.values()) job.stop();
    this.cronJobs.clear();
    logger.info('brainstem stopped');
  }

  private async heartbeat(): Promise<void> {
    logger.debug('heartbeat tick');
    const db = getDb();
    db.prepare("INSERT OR REPLACE INTO config_kv (key, value, updated_at) VALUES ('last_heartbeat', ?, datetime('now'))")
      .run(String(Date.now()));
  }

  private async dream(): Promise<void> {
    logger.info('dream cycle — memory consolidation');
    try {
      const { Dreamer } = await import('./dreamer.js');
      const dreamer = new Dreamer();
      const report = await dreamer.consolidate();
      logger.info({ report }, 'dream complete');

      if (this.notifyFn && (report.merged > 0 || report.insights > 0 || report.compacted > 0)) {
        await this.notifyFn(
          `🌙 *Sonho concluído*\n` +
          `📉 Decayed: ${report.decayed}\n` +
          `📦 Merged: ${report.merged}\n` +
          `🗜️ Compacted: ${report.compacted}\n` +
          `💡 Insights: ${report.insights}`
        );
      }
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, 'dream failed');
    }
  }

  private async backup(): Promise<void> {
    logger.info('auto-backup started');
    try {
      const { copyFileSync, mkdirSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { getDataDir } = await import('../config/loader.js');

      const dataDir = getDataDir();
      const backupDir = join(dataDir, 'backups');
      mkdirSync(backupDir, { recursive: true });

      const timestamp = new Date().toISOString().slice(0, 10);
      const dbSrc = join(dataDir, 'pegasus.db');
      copyFileSync(dbSrc, join(backupDir, `pegasus-${timestamp}.db`));

      logger.info({ timestamp }, 'backup complete');
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, 'backup failed');
    }
  }

  private loadCronJobs(): void {
    const db = getDb();
    const jobs = db.prepare('SELECT * FROM cron_jobs WHERE enabled = 1').all() as Array<Record<string, unknown>>;

    for (const job of jobs) {
      const expr = job.expression as string;
      if (cron.validate(expr)) {
        const task = cron.schedule(expr, async () => {
          logger.info({ task: job.task_description }, 'cron job executing');
          db.prepare('UPDATE cron_jobs SET last_run = ? WHERE id = ?').run(Date.now(), job.id);
          if (this.notifyFn) {
            await this.notifyFn(`⏰ Cron: ${job.task_description as string}`);
          }
        });
        this.cronJobs.set(job.id as string, task);
      }
    }

    if (jobs.length > 0) {
      logger.info({ count: jobs.length }, 'cron jobs loaded');
    }
  }
}
