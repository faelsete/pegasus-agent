import Database from 'better-sqlite3';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { getDataDir } from '../config/loader.js';
import { getLogger } from '../utils/logger.js';

// ═══════════════════════════════════════════
// SQLite Database (better-sqlite3)
// ═══════════════════════════════════════════

const logger = getLogger('sqlite');

let db: Database.Database | null = null;

/** Initialize SQLite database with all tables */
export function initDatabase(): Database.Database {
  if (db) return db;

  const dataDir = getDataDir();
  mkdirSync(dataDir, { recursive: true });

  const dbPath = join(dataDir, 'pegasus.db');
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);
  logger.info({ path: dbPath }, 'SQLite initialized');

  return db;
}

/** Get database instance */
export function getDb(): Database.Database {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/** Close database connection */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/** Run all migrations */
function runMigrations(database: Database.Database): void {
  database.exec(`
    -- Conversations
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      started_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      summary TEXT,
      message_count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    -- Messages
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
      content TEXT NOT NULL,
      thinking TEXT,
      tools_used TEXT,
      tokens_estimated INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

    -- Entities (Knowledge Graph Nodes)
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      summary TEXT,
      first_seen INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      last_seen INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      access_count INTEGER NOT NULL DEFAULT 1,
      vector_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
    CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);

    -- Relations (Knowledge Graph Edges)
    CREATE TABLE IF NOT EXISTS relations (
      id TEXT PRIMARY KEY,
      from_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      to_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      relation_type TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.8,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_entity_id);
    CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_entity_id);

    -- Facts
    CREATE TABLE IF NOT EXISTS facts (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      source_message_id TEXT REFERENCES messages(id),
      entity_id TEXT REFERENCES entities(id),
      confidence REAL NOT NULL DEFAULT 0.8,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      vector_id TEXT
    );

    -- Cron Jobs
    CREATE TABLE IF NOT EXISTS cron_jobs (
      id TEXT PRIMARY KEY,
      expression TEXT NOT NULL,
      task_description TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run INTEGER,
      next_run INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    -- Config Key-Value Store
    CREATE TABLE IF NOT EXISTS config_kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Doctor Log
    CREATE TABLE IF NOT EXISTS doctor_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      check_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('ok', 'warn', 'error', 'repaired')),
      details TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    -- Pending Tasks (retry after failure)
    CREATE TABLE IF NOT EXISTS pending_tasks (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      user_message TEXT NOT NULL,
      error_reason TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed')),
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      last_attempt INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_tasks(status);

    -- Token Usage Odometer
    CREATE TABLE IF NOT EXISTS token_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      model TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      conversation_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );
  `);

  logger.debug('Migrations complete');
}
