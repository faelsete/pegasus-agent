import { searchSemantic, searchFTS, type MemoryResult } from './store.js';
import { searchEntities, getRelatedFacts, type Entity } from './knowledge.js';
import { getConfig } from '../config/loader.js';
import { getLogger } from '../utils/logger.js';

// ═══════════════════════════════════════════
// Hybrid Search (Semantic + FTS + Knowledge Graph)
// ═══════════════════════════════════════════

const logger = getLogger('search');

export interface SearchResult {
  text: string;
  type: string;
  score: number;
  source: string;
  timestamp: number;
}

/**
 * Main search function — called BEFORE every LLM response.
 * Combines semantic search, full-text search, and knowledge graph.
 */
export async function searchRelevantContext(query: string): Promise<SearchResult[]> {
  const config = getConfig();
  const limit = config.memory.maxSearchResults;

  // Run all three searches in parallel
  const [semanticResults, ftsResults, entities] = await Promise.all([
    searchSemantic(query, limit * 2).catch(() => [] as MemoryResult[]),
    searchFTS(query, limit * 2).catch(() => [] as MemoryResult[]),
    Promise.resolve(searchEntities(query, limit)),
  ]);

  // Collect entity-related facts
  const entityFacts: SearchResult[] = [];
  for (const entity of entities) {
    const facts = getRelatedFacts(entity.id);
    for (const fact of facts) {
      entityFacts.push({
        text: `[${entity.name}] ${fact}`,
        type: 'fact',
        score: 0.7,
        source: 'knowledge_graph',
        timestamp: entity.lastSeen,
      });
    }
  }

  // Merge all results
  const allResults: SearchResult[] = [
    ...semanticResults.map(r => ({
      text: r.text, type: r.type, score: r.score,
      source: r.source, timestamp: r.timestamp,
    })),
    ...ftsResults.map(r => ({
      text: r.text, type: r.type, score: r.score * 0.9,
      source: r.source, timestamp: r.timestamp,
    })),
    ...entityFacts,
  ];

  // Deduplicate by text similarity
  const seen = new Set<string>();
  const unique = allResults.filter(r => {
    const key = r.text.slice(0, 100).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Re-rank: score + recency bonus + access bonus
  const now = Date.now();
  const ranked = unique.map(r => ({
    ...r,
    score: r.score + recencyBonus(r.timestamp, now),
  }));

  // Sort by final score, return top N
  ranked.sort((a, b) => b.score - a.score);
  const top = ranked.slice(0, limit);

  logger.debug({ query: query.slice(0, 50), found: top.length }, 'search complete');
  return top;
}

/** Search related entities from knowledge graph */
export function searchRelatedEntities(query: string): Entity[] {
  return searchEntities(query, 5);
}

/** Recency bonus: newer memories get higher scores */
function recencyBonus(timestamp: number, now: number): number {
  const ageHours = (now - timestamp) / (1000 * 60 * 60);
  if (ageHours < 1) return 0.15;
  if (ageHours < 24) return 0.10;
  if (ageHours < 168) return 0.05; // 1 week
  return 0;
}
