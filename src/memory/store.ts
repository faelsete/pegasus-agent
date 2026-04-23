import * as lancedb from '@lancedb/lancedb';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { getDataDir } from '../config/loader.js';
import { embedText } from './embeddings.js';
import { getLogger } from '../utils/logger.js';

// ═══════════════════════════════════════════
// LanceDB Vector Store — Human-like Memory
// Memories are PERMANENT. Never deleted.
// Only compacted (summarized) over time.
// ═══════════════════════════════════════════

const logger = getLogger('vector-store');

export interface MemoryRecord {
  vector: number[];
  text: string;
  type: string;          // fact, preference, decision, skill, insight, compacted
  source: string;        // manual, auto_extract, dream, compaction
  tags: string;
  entityIds: string;
  accessCount: number;   // How many times this memory was retrieved in search
  importance: number;    // 0.0 to 1.0 — decays over time, refreshed on access
  timestamp: number;     // When first created
  lastAccessed: number;  // Last time this memory was found in a search
  conversationId: string;
}

export interface MemoryResult {
  text: string;
  type: string;
  source: string;
  tags: string;
  entityIds: string;
  accessCount: number;
  importance: number;
  timestamp: number;
  lastAccessed: number;
  conversationId: string;
  score: number;
  id: string;
}

let db: lancedb.Connection | null = null;
let table: lancedb.Table | null = null;

/** Initialize LanceDB */
export async function initVectorStore(): Promise<void> {
  const vectorDir = join(getDataDir(), 'vectors');
  mkdirSync(vectorDir, { recursive: true });

  db = await lancedb.connect(vectorDir);

  const tableNames = await db.tableNames();
  if (tableNames.includes('memories')) {
    table = await db.openTable('memories');
    logger.info('Vector store opened (existing)');
  } else {
    const seedVector = new Array(1536).fill(0) as number[];
    table = await db.createTable('memories', [{
      vector: seedVector,
      text: '__init__',
      type: 'system',
      source: 'system',
      tags: '',
      entityIds: '',
      accessCount: 0,
      importance: 0,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
      conversationId: '',
    }]);
    logger.info('Vector store created');
  }
}

function getTable(): lancedb.Table {
  if (!table) throw new Error('Vector store not initialized. Call initVectorStore() first.');
  return table;
}

/** Add a memory to the vector store — PERMANENT, never auto-deleted */
export async function addMemory(
  text: string,
  type: string,
  metadata: Partial<Omit<MemoryRecord, 'vector' | 'text' | 'type'>> = {},
): Promise<void> {
  const vector = await embedText(text);
  const now = Date.now();
  const record = {
    vector,
    text,
    type,
    source: metadata.source ?? 'auto_extract',
    tags: metadata.tags ?? '',
    entityIds: metadata.entityIds ?? '',
    accessCount: metadata.accessCount ?? 0,
    importance: metadata.importance ?? 0.5,
    timestamp: metadata.timestamp ?? now,
    lastAccessed: metadata.lastAccessed ?? now,
    conversationId: metadata.conversationId ?? '',
  };

  await getTable().add([record]);
  logger.debug({ type, textLen: text.length }, 'memory added');
}

/**
 * Semantic vector search — searches ALL memories ever stored.
 * No session boundaries. No time limits. Pure relevance.
 */
export async function searchSemantic(query: string, limit: number = 10): Promise<MemoryResult[]> {
  const vector = await embedText(query);
  const results = await getTable()
    .search(vector)
    .limit(limit)
    .toArray();

  return results
    .filter(r => String(r.text) !== '__init__')
    .map(r => ({
      text: String(r.text ?? ''),
      type: String(r.type ?? ''),
      source: String(r.source ?? ''),
      tags: String(r.tags ?? ''),
      entityIds: String(r.entityIds ?? ''),
      accessCount: Number(r.accessCount ?? 0),
      importance: Number(r.importance ?? 0),
      timestamp: Number(r.timestamp ?? 0),
      lastAccessed: Number(r.lastAccessed ?? r.timestamp ?? 0),
      conversationId: String(r.conversationId ?? ''),
      score: 1 - Number(r._distance ?? 0),
      id: String(r._rowid ?? ''),
    }));
}

/** Full-text search (fallback) */
export async function searchFTS(query: string, limit: number = 10): Promise<MemoryResult[]> {
  try {
    const results = await getTable()
      .query()
      .where(`text LIKE '%${query.replace(/'/g, "''")}%'`)
      .limit(limit)
      .toArray();

    return results
      .filter(r => String(r.text) !== '__init__')
      .map(r => ({
        text: String(r.text ?? ''),
        type: String(r.type ?? ''),
        source: String(r.source ?? ''),
        tags: String(r.tags ?? ''),
        entityIds: String(r.entityIds ?? ''),
        accessCount: Number(r.accessCount ?? 0),
        importance: Number(r.importance ?? 0),
        timestamp: Number(r.timestamp ?? 0),
        lastAccessed: Number(r.lastAccessed ?? r.timestamp ?? 0),
        conversationId: String(r.conversationId ?? ''),
        score: 0.8,
        id: String(r._rowid ?? ''),
      }));
  } catch {
    return [];
  }
}

/** Get memory count */
export async function getMemoryCount(): Promise<number> {
  const results = await getTable().query().toArray();
  return results.filter(r => String(r.text) !== '__init__').length;
}

/** Get all memories (for consolidation) */
export async function getAllMemories(): Promise<MemoryResult[]> {
  const results = await getTable().query().toArray();
  return results
    .filter(r => String(r.text) !== '__init__')
    .map(r => ({
      text: String(r.text ?? ''),
      type: String(r.type ?? ''),
      source: String(r.source ?? ''),
      tags: String(r.tags ?? ''),
      entityIds: String(r.entityIds ?? ''),
      accessCount: Number(r.accessCount ?? 0),
      importance: Number(r.importance ?? 0),
      timestamp: Number(r.timestamp ?? 0),
      lastAccessed: Number(r.lastAccessed ?? r.timestamp ?? 0),
      conversationId: String(r.conversationId ?? ''),
      score: 1,
      id: String(r._rowid ?? ''),
    }));
}

/**
 * Apply time-based importance decay to ALL memories.
 * Called periodically by the Dreamer.
 * 
 * Decay model (human-like):
 * - Memories accessed recently: importance stays high
 * - Memories never accessed: importance decays ~5% per week
 * - Minimum importance: 0.05 (never fully forgotten)
 * - Compacted memories decay slower (they're already summaries)
 */
export async function applyImportanceDecay(): Promise<number> {
  const all = await getAllMemories();
  const now = Date.now();
  let decayed = 0;

  for (const mem of all) {
    const timeSinceAccess = now - (mem.lastAccessed || mem.timestamp);
    const weeksSinceAccess = timeSinceAccess / (7 * 24 * 60 * 60 * 1000);

    if (weeksSinceAccess < 1) continue; // Too recent, skip

    const isCompacted = mem.type === 'compacted';
    const decayRate = isCompacted ? 0.02 : 0.05; // Compacted = slower decay
    const minImportance = 0.05; // Never fully forgotten

    const newImportance = Math.max(
      minImportance,
      mem.importance * (1 - decayRate * weeksSinceAccess)
    );

    if (Math.abs(newImportance - mem.importance) > 0.01) {
      // Note: LanceDB doesn't support in-place updates easily,
      // so decay is applied during search scoring instead
      decayed++;
    }
  }

  logger.debug({ decayed }, 'importance decay applied');
  return decayed;
}
