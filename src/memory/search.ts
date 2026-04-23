import { searchSemantic, searchFTS, type MemoryResult } from './store.js';
import { searchEntities, getRelatedFacts, type Entity } from './knowledge.js';
import { getConfig } from '../config/loader.js';
import { getLogger } from '../utils/logger.js';

// ═══════════════════════════════════════════
// Hybrid Search — Human-like Memory Retrieval
// 
// Scoring model:
// - Semantic relevance (cosine similarity) = base score
// - Recency boost: recent memories get small bonus
// - Access strength: frequently accessed = stronger
// - Importance weight: high-importance memories rank higher
// - Time decay: old + never-accessed = lower score (but never zero)
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
 * Searches ALL memories ever stored, regardless of session.
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
  const now = Date.now();
  const allResults: SearchResult[] = [
    ...semanticResults.map(r => ({
      text: r.text, type: r.type,
      score: computeHumanScore(r, now),
      source: r.source, timestamp: r.timestamp,
    })),
    ...ftsResults.map(r => ({
      text: r.text, type: r.type,
      score: computeHumanScore(r, now) * 0.9,
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

  // Sort by final score, return top N
  unique.sort((a, b) => b.score - a.score);
  const top = unique.slice(0, limit);

  if (top.length > 0) {
    logger.info({ query: query.slice(0, 50), found: top.length, topScore: top[0]?.score.toFixed(3) }, 'memories found');
  } else {
    logger.debug({ query: query.slice(0, 50) }, 'no memories found');
  }

  return top;
}

/** Search related entities from knowledge graph */
export function searchRelatedEntities(query: string): Entity[] {
  return searchEntities(query, 5);
}

/**
 * Human-like memory scoring.
 * 
 * Like human memory:
 * - Relevance (semantic) is king — if it matches, it surfaces
 * - Recent memories have a small edge (short-term buffer)
 * - Frequently accessed memories are stronger (rehearsal effect)
 * - High-importance memories resist decay (emotional weight)
 * - Old + never-accessed memories fade but never disappear
 */
function computeHumanScore(memory: MemoryResult, now: number): number {
  const baseScore = memory.score; // cosine similarity (0-1)

  // 1. Recency — small boost for recent memories (short-term memory effect)
  const ageHours = (now - memory.timestamp) / (1000 * 60 * 60);
  const recency = ageHours < 1 ? 0.12
    : ageHours < 24 ? 0.08
    : ageHours < 168 ? 0.04    // 1 week
    : ageHours < 720 ? 0.02    // 1 month
    : 0.01;                     // Always a tiny minimum (never zero)

  // 2. Access strength — frequently recalled memories are stronger (rehearsal)
  const accessBonus = Math.min(0.15, memory.accessCount * 0.02);

  // 3. Importance weight — high-importance memories resist fading
  const importanceBonus = memory.importance * 0.10;

  // 4. Time decay — old + never-accessed memories fade
  const lastAccessed = memory.lastAccessed || memory.timestamp;
  const daysSinceAccess = (now - lastAccessed) / (1000 * 60 * 60 * 24);
  const decayPenalty = daysSinceAccess > 30 ? Math.min(0.10, daysSinceAccess * 0.001) : 0;

  return baseScore + recency + accessBonus + importanceBonus - decayPenalty;
}
