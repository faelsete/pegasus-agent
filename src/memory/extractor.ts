import { generateText } from 'ai';
import { z } from 'zod';
import { addMemory } from './store.js';
import { addEntity, addRelation, addFact } from './knowledge.js';
import { selectModel } from '../brain/router.js';
import { getConfig } from '../config/loader.js';
import { getLogger } from '../utils/logger.js';

// ═══════════════════════════════════════════
// Automatic Memory Extractor
// ═══════════════════════════════════════════

const logger = getLogger('extractor');

const ExtractionSchema = z.object({
  entities: z.array(z.object({
    name: z.string(),
    type: z.string(), // person, project, technology, place, concept
    summary: z.string().optional(),
  })).default([]),
  facts: z.array(z.string()).default([]),
  preferences: z.array(z.string()).default([]),
  decisions: z.array(z.string()).default([]),
  relations: z.array(z.object({
    from: z.string(),
    to: z.string(),
    type: z.string(),
  })).default([]),
});

type Extraction = z.infer<typeof ExtractionSchema>;

const EXTRACTION_PROMPT = `You are a memory extraction system. Analyze the conversation and extract:

1. **entities**: People, projects, technologies, places, concepts mentioned
2. **facts**: Verifiable statements or information shared
3. **preferences**: User preferences, likes, dislikes
4. **decisions**: Decisions made during the conversation
5. **relations**: Relationships between entities (e.g., "user works_with TypeScript")

Return ONLY valid JSON matching this schema. If nothing to extract, return empty arrays.
Do NOT include greetings, small talk, or meta-conversation as facts.

JSON Schema:
{
  "entities": [{"name": "string", "type": "string", "summary": "string"}],
  "facts": ["string"],
  "preferences": ["string"],
  "decisions": ["string"],
  "relations": [{"from": "string", "to": "string", "type": "string"}]
}`;

/**
 * Automatically extract and store memories from a conversation exchange.
 * Called after EVERY agent response.
 */
export async function extractAndStore(
  userMessage: string,
  agentResponse: string,
  conversationId?: string,
): Promise<void> {
  const config = getConfig();
  if (!config.memory.autoExtract) return;

  try {
    const model = selectModel('fast');

    const result = await generateText({
      model,
      system: EXTRACTION_PROMPT,
      prompt: `User: ${userMessage}\n\nAssistant: ${agentResponse}`,
      temperature: 0.1,
    });

    // Parse JSON from response
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const parsed = ExtractionSchema.safeParse(JSON.parse(jsonMatch[0]));
    if (!parsed.success) {
      logger.debug({ error: parsed.error.message }, 'extraction parse failed');
      return;
    }

    const extraction = parsed.data;
    await storeExtraction(extraction, conversationId);

    const total = extraction.entities.length + extraction.facts.length +
      extraction.preferences.length + extraction.decisions.length;
    if (total > 0) {
      logger.debug({
        entities: extraction.entities.length,
        facts: extraction.facts.length,
        preferences: extraction.preferences.length,
        decisions: extraction.decisions.length,
      }, 'memories extracted');
    }
  } catch (error) {
    // Extraction failure should never block the main flow
    logger.debug({ error: error instanceof Error ? error.message : String(error) }, 'extraction failed silently');
  }
}

async function storeExtraction(extraction: Extraction, conversationId?: string): Promise<void> {
  // Store entities
  const entityMap = new Map<string, string>(); // name → id
  for (const e of extraction.entities) {
    const entity = addEntity(e.name, e.type, e.summary);
    entityMap.set(e.name, entity.id);
  }

  // Store relations
  for (const r of extraction.relations) {
    const fromId = entityMap.get(r.from);
    const toId = entityMap.get(r.to);
    if (fromId && toId) {
      addRelation(fromId, toId, r.type);
    }
  }

  // Store facts
  for (const fact of extraction.facts) {
    addFact(fact);
    await addMemory(fact, 'fact', { source: 'auto_extract', conversationId: conversationId ?? '' });
  }

  // Store preferences
  for (const pref of extraction.preferences) {
    await addMemory(pref, 'preference', { source: 'auto_extract', importance: 0.7, conversationId: conversationId ?? '' });
  }

  // Store decisions
  for (const dec of extraction.decisions) {
    await addMemory(dec, 'decision', { source: 'auto_extract', importance: 0.8, conversationId: conversationId ?? '' });
  }
}
