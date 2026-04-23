import crypto from 'node:crypto';
import { getDb } from '../db/sqlite.js';
import { getLogger } from '../utils/logger.js';

// ═══════════════════════════════════════════
// Knowledge Graph (SQLite)
// ═══════════════════════════════════════════

const logger = getLogger('knowledge');

export interface Entity {
  id: string;
  name: string;
  type: string;
  summary: string | null;
  firstSeen: number;
  lastSeen: number;
  accessCount: number;
}

export interface Relation {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  relationType: string;
  confidence: number;
}

/** Add or update an entity */
export function addEntity(name: string, type: string, summary?: string): Entity {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM entities WHERE LOWER(name) = LOWER(?)').get(name) as Record<string, unknown> | undefined;

  if (existing) {
    db.prepare('UPDATE entities SET last_seen = ?, access_count = access_count + 1, summary = COALESCE(?, summary) WHERE id = ?')
      .run(Date.now(), summary ?? null, existing.id);
    return {
      id: existing.id as string, name: existing.name as string, type: existing.type as string,
      summary: (summary ?? existing.summary) as string | null,
      firstSeen: existing.first_seen as number, lastSeen: Date.now(),
      accessCount: (existing.access_count as number) + 1,
    };
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare('INSERT INTO entities (id, name, type, summary, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, name, type, summary ?? null, now, now);

  logger.debug({ name, type }, 'entity added');
  return { id, name, type, summary: summary ?? null, firstSeen: now, lastSeen: now, accessCount: 1 };
}

/** Add a relation between entities */
export function addRelation(fromId: string, toId: string, relationType: string, confidence: number = 0.8): void {
  const db = getDb();
  const existing = db.prepare(
    'SELECT id FROM relations WHERE from_entity_id = ? AND to_entity_id = ? AND relation_type = ?'
  ).get(fromId, toId, relationType);

  if (existing) return; // avoid duplicates

  const id = crypto.randomUUID();
  db.prepare('INSERT INTO relations (id, from_entity_id, to_entity_id, relation_type, confidence) VALUES (?, ?, ?, ?, ?)')
    .run(id, fromId, toId, relationType, confidence);
}

/** Search entities by name or type */
export function searchEntities(query: string, limit: number = 10): Entity[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM entities WHERE name LIKE ? OR type LIKE ? OR summary LIKE ? ORDER BY access_count DESC LIMIT ?'
  ).all(`%${query}%`, `%${query}%`, `%${query}%`, limit) as Record<string, unknown>[];

  return rows.map(mapEntity);
}

/** Get related facts for an entity */
export function getRelatedFacts(entityId: string): string[] {
  const db = getDb();
  const rows = db.prepare('SELECT content FROM facts WHERE entity_id = ? ORDER BY created_at DESC LIMIT 20')
    .all(entityId) as Array<{ content: string }>;
  return rows.map(r => r.content);
}

/** Get entity network (subgraph) up to N depth */
export function getEntityNetwork(entityId: string, depth: number = 2): Entity[] {
  const db = getDb();
  const visited = new Set<string>([entityId]);
  let frontier = [entityId];
  const result: Entity[] = [];

  for (let d = 0; d < depth && frontier.length > 0; d++) {
    const nextFrontier: string[] = [];
    for (const id of frontier) {
      const relations = db.prepare(
        'SELECT to_entity_id FROM relations WHERE from_entity_id = ? UNION SELECT from_entity_id FROM relations WHERE to_entity_id = ?'
      ).all(id, id) as Array<{ to_entity_id?: string; from_entity_id?: string }>;

      for (const rel of relations) {
        const targetId = (rel.to_entity_id ?? rel.from_entity_id) as string;
        if (!visited.has(targetId)) {
          visited.add(targetId);
          nextFrontier.push(targetId);
          const entity = db.prepare('SELECT * FROM entities WHERE id = ?').get(targetId) as Record<string, unknown> | undefined;
          if (entity) result.push(mapEntity(entity));
        }
      }
    }
    frontier = nextFrontier;
  }

  return result;
}

/** Get top entities by access count */
export function getTopEntities(limit: number = 20): Entity[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM entities ORDER BY access_count DESC LIMIT ?').all(limit) as Record<string, unknown>[];
  return rows.map(mapEntity);
}

/** Store a fact linked to an entity */
export function addFact(content: string, entityId?: string, sourceMessageId?: string): void {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO facts (id, content, source_message_id, entity_id) VALUES (?, ?, ?, ?)')
    .run(id, content, sourceMessageId ?? null, entityId ?? null);
}

function mapEntity(row: Record<string, unknown>): Entity {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as string,
    summary: row.summary as string | null,
    firstSeen: row.first_seen as number,
    lastSeen: row.last_seen as number,
    accessCount: row.access_count as number,
  };
}
