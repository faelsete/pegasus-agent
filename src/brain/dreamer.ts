import { getAllMemories, addMemory, applyImportanceDecay } from '../memory/store.js';
import { getTopEntities, getEntityNetwork } from '../memory/knowledge.js';
import { embedText } from '../memory/embeddings.js';
import { generateText } from 'ai';
import { selectModel } from './router.js';
import { getConfig } from '../config/loader.js';
import { getLogger } from '../utils/logger.js';

// ═══════════════════════════════════════════
// Dreamer — Human-like Memory Consolidation
//
// Like sleep consolidation in the brain:
// 1. DECAY — Reduce importance of unaccessed memories
// 2. DEDUP — Remove exact duplicates
// 3. COMPACT — Merge old, low-importance memories into summaries
// 4. INSIGHTS — Cross-reference entities to generate new knowledge
//
// RULE: Memories are NEVER deleted. Only compacted.
// ═══════════════════════════════════════════

const logger = getLogger('dreamer');

export interface DreamReport {
  decayed: number;
  merged: number;
  compacted: number;
  insights: number;
}

export class Dreamer {
  async consolidate(): Promise<DreamReport> {
    const report: DreamReport = { decayed: 0, merged: 0, compacted: 0, insights: 0 };

    try {
      // 1. DECAY — Apply time-based importance reduction
      report.decayed = await applyImportanceDecay();
      logger.debug({ decayed: report.decayed }, 'decay phase complete');

      // 2. DEDUP — Find and flag exact duplicates
      const allMemories = await getAllMemories();
      const seen = new Map<string, string>();
      for (const mem of allMemories) {
        const key = mem.text.trim().toLowerCase();
        if (seen.has(key)) {
          report.merged++;
        } else {
          seen.set(key, mem.id);
        }
      }
      logger.debug({ merged: report.merged }, 'dedup phase complete');

      // 3. COMPACT — Group old low-importance memories and summarize
      const now = Date.now();
      const oldLowImportance = allMemories.filter(m => {
        const ageWeeks = (now - m.timestamp) / (7 * 24 * 60 * 60 * 1000);
        return ageWeeks > 4 && m.importance < 0.3 && m.type !== 'compacted';
      });

      // Group old memories in batches of 10 and create summaries
      if (oldLowImportance.length >= 5) {
        const batches = chunkArray(oldLowImportance, 10);
        for (const batch of batches.slice(0, 3)) { // Max 3 compactions per cycle
          try {
            const model = selectModel('fast');
            const memoryTexts = batch.map(m => `- [${m.type}] ${m.text}`).join('\n');

            const result = await generateText({
              model,
              system: `You are a memory compaction system. Given a list of old memories, create a SINGLE concise summary that preserves the essential information. Be brief but complete. Write in the same language as the memories.`,
              prompt: `Compact these ${batch.length} memories into one summary:\n\n${memoryTexts}`,
              temperature: 0.2,
            });

            if (result.text.trim()) {
              await addMemory(result.text.trim(), 'compacted', {
                source: 'compaction',
                importance: 0.3,
                tags: 'compacted',
              });
              report.compacted++;
              logger.debug({ batchSize: batch.length, summary: result.text.slice(0, 100) }, 'memories compacted');
            }
          } catch {
            continue;
          }
        }
      }

      // 4. INSIGHTS — Cross-reference top entities
      const topEntities = getTopEntities(10);
      for (const entity of topEntities) {
        const network = getEntityNetwork(entity.id, 2);
        if (network.length >= 3) {
          try {
            const model = selectModel('fast');
            const result = await generateText({
              model,
              system: 'Generate a brief insight (1-2 sentences) connecting these entities. Write in the same language as the entity names.',
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

      logger.info(report, 'dream cycle complete');
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, 'consolidation error');
    }

    return report;
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
