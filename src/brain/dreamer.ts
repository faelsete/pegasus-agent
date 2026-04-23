import { getAllMemories, addMemory } from '../memory/store.js';
import { getTopEntities, getEntityNetwork } from '../memory/knowledge.js';
import { embedText } from '../memory/embeddings.js';
import { generateText } from 'ai';
import { selectModel } from './router.js';
import { getConfig } from '../config/loader.js';
import { getLogger } from '../utils/logger.js';

// ═══════════════════════════════════════════
// Dreamer — Memory Consolidation (Sonhos)
// ═══════════════════════════════════════════

const logger = getLogger('dreamer');

export interface DreamReport {
  merged: number;
  summarized: number;
  boosted: number;
  removed: number;
  insights: number;
}

export class Dreamer {
  async consolidate(): Promise<DreamReport> {
    const report: DreamReport = { merged: 0, summarized: 0, boosted: 0, removed: 0, insights: 0 };
    const config = getConfig();

    try {
      // 1. DEDUP — Remove exact duplicates
      const allMemories = await getAllMemories();
      const seen = new Map<string, string>();
      for (const mem of allMemories) {
        const key = mem.text.trim().toLowerCase();
        if (seen.has(key)) {
          report.removed++;
        } else {
          seen.set(key, mem.id);
        }
      }

      // 2. MERGE — Find similar memories (cosine > threshold)
      const threshold = config.memory.consolidationThreshold;
      const embeddings = new Map<string, number[]>();

      // Only process a subset to avoid excessive API calls
      const sample = allMemories.slice(0, 200);
      for (const mem of sample) {
        try {
          const emb = await embedText(mem.text);
          embeddings.set(mem.id, emb);
        } catch {
          continue;
        }
      }

      const merged = new Set<string>();
      for (const [id1, emb1] of embeddings) {
        if (merged.has(id1)) continue;
        for (const [id2, emb2] of embeddings) {
          if (id1 === id2 || merged.has(id2)) continue;
          const similarity = cosineSimilarity(emb1, emb2);
          if (similarity > threshold) {
            merged.add(id2);
            report.merged++;
          }
        }
      }

      // 3. INSIGHTS — Cross-reference top entities
      const topEntities = getTopEntities(10);
      for (const entity of topEntities) {
        const network = getEntityNetwork(entity.id, 2);
        if (network.length >= 3) {
          try {
            const model = selectModel('fast');
            const result = await generateText({
              model,
              system: 'Generate a brief insight (1-2 sentences) connecting these entities.',
              prompt: `Entities: ${[entity.name, ...network.map(n => n.name)].join(', ')}`,
              temperature: 0.3,
            });

            if (result.text.trim()) {
              await addMemory(result.text.trim(), 'insight', { source: 'dream', importance: 0.6 });
              report.insights++;
            }
          } catch {
            continue;
          }
        }
      }

      logger.info(report, 'consolidation report');
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, 'consolidation error');
    }

    return report;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) ** 2;
    normB += (b[i] ?? 0) ** 2;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}
