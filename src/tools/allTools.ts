import { z } from 'zod';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { buildTool } from './base.js';
import { searchRelevantContext } from '../memory/search.js';
import { addMemory } from '../memory/store.js';
import { getDb } from '../db/sqlite.js';
import crypto from 'node:crypto';

// ═══════════════════════════════════════════
// All Tools
// ═══════════════════════════════════════════

export const BashTool = buildTool({
  name: 'bash',
  description: 'Execute a shell command on the system. Returns stdout and stderr.',
  isReadOnly: false,
  needsConfirmation: true,
  inputSchema: z.object({
    command: z.string().describe('Shell command to execute'),
    timeout: z.number().optional().default(30000).describe('Timeout in milliseconds'),
  }),
  execute: async ({ command, timeout }) => {
    try {
      const result = execSync(command, { timeout, encoding: 'utf-8', maxBuffer: 1024 * 1024 });
      return result.trim() || '(no output)';
    } catch (err) {
      const error = err as { stderr?: string; message?: string };
      return `Error: ${error.stderr ?? error.message ?? String(err)}`;
    }
  },
});

export const FileReadTool = buildTool({
  name: 'file_read',
  description: 'Read the contents of a file. Returns the file text.',
  inputSchema: z.object({
    path: z.string().describe('Absolute or relative file path'),
    maxLines: z.number().optional().describe('Max lines to read'),
  }),
  execute: async ({ path, maxLines }) => {
    if (!existsSync(path)) return `Error: File not found: ${path}`;
    const content = readFileSync(path, 'utf-8');
    if (maxLines) {
      const lines = content.split('\n').slice(0, maxLines);
      return lines.join('\n') + (content.split('\n').length > maxLines ? `\n... (${content.split('\n').length - maxLines} more lines)` : '');
    }
    return content;
  },
});

export const FileWriteTool = buildTool({
  name: 'file_write',
  description: 'Write content to a file. Creates parent directories if needed.',
  isReadOnly: false,
  needsConfirmation: true,
  inputSchema: z.object({
    path: z.string().describe('File path to write to'),
    content: z.string().describe('Content to write'),
  }),
  execute: async ({ path, content }) => {
    const { mkdirSync } = await import('node:fs');
    const { dirname } = await import('node:path');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, 'utf-8');
    return `File written: ${path} (${content.length} bytes)`;
  },
});

export const GlobTool = buildTool({
  name: 'glob',
  description: 'List files matching a glob pattern in a directory.',
  inputSchema: z.object({
    pattern: z.string().describe('Glob pattern (e.g., "**/*.ts")'),
    cwd: z.string().optional().describe('Working directory'),
  }),
  execute: async ({ pattern, cwd }) => {
    const { globSync } = await import('node:fs');
    try {
      const files = globSync(pattern, { cwd: cwd ?? process.cwd() });
      return files.length > 0 ? files.join('\n') : 'No files found';
    } catch {
      return `Error: Invalid glob pattern: ${pattern}`;
    }
  },
});

export const GrepTool = buildTool({
  name: 'grep',
  description: 'Search for text in files using grep.',
  inputSchema: z.object({
    query: z.string().describe('Text or regex to search for'),
    path: z.string().optional().default('.').describe('Directory or file to search'),
    flags: z.string().optional().default('-rn').describe('Grep flags'),
  }),
  execute: async ({ query, path, flags }) => {
    try {
      const result = execSync(`grep ${flags} "${query}" ${path}`, { encoding: 'utf-8', maxBuffer: 1024 * 1024 });
      const lines = result.trim().split('\n');
      return lines.length > 50 ? lines.slice(0, 50).join('\n') + `\n... (${lines.length - 50} more matches)` : result.trim();
    } catch {
      return 'No matches found';
    }
  },
});

export const WebSearchTool = buildTool({
  name: 'web_search',
  description: 'Search the web using DuckDuckGo. Returns titles, URLs, and snippets.',
  inputSchema: z.object({
    query: z.string().describe('Search query'),
    maxResults: z.number().optional().default(5),
  }),
  execute: async ({ query, maxResults }) => {
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await res.text();
      const { load } = await import('cheerio');
      const $ = load(html);
      const results: string[] = [];
      $('.result').slice(0, maxResults).each((_, el) => {
        const title = $(el).find('.result__title').text().trim();
        const snippet = $(el).find('.result__snippet').text().trim();
        const href = $(el).find('.result__url').text().trim();
        if (title) results.push(`${title}\n${href}\n${snippet}`);
      });
      return results.length > 0 ? results.join('\n\n') : 'No results found';
    } catch (err) {
      return `Search error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});

export const WebFetchTool = buildTool({
  name: 'web_fetch',
  description: 'Fetch a URL and return its text content (HTML stripped to readable text).',
  inputSchema: z.object({
    url: z.string().url().describe('URL to fetch'),
    maxChars: z.number().optional().default(5000),
  }),
  execute: async ({ url, maxChars }) => {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await res.text();
      const { load } = await import('cheerio');
      const $ = load(html);
      $('script, style, nav, footer, header').remove();
      const text = $('body').text().replace(/\s+/g, ' ').trim();
      return text.slice(0, maxChars) + (text.length > maxChars ? '...' : '');
    } catch (err) {
      return `Fetch error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});

export const SystemInfoTool = buildTool({
  name: 'system_info',
  description: 'Get system information: CPU, memory, disk, uptime.',
  inputSchema: z.object({}),
  execute: async () => {
    const os = await import('node:os');
    const mem = os.freemem();
    const total = os.totalmem();
    return [
      `Platform: ${os.platform()} ${os.arch()}`,
      `CPU: ${os.cpus()[0]?.model ?? 'unknown'} (${os.cpus().length} cores)`,
      `Memory: ${(mem / 1e9).toFixed(1)}GB free / ${(total / 1e9).toFixed(1)}GB total`,
      `Uptime: ${(os.uptime() / 3600).toFixed(1)}h`,
      `Hostname: ${os.hostname()}`,
      `Node: ${process.version}`,
    ].join('\n');
  },
});

export const MemorySearchTool = buildTool({
  name: 'memory_search',
  description: 'Search the agent memory for relevant information about a topic.',
  inputSchema: z.object({
    query: z.string().describe('What to search for in memory'),
    limit: z.number().optional().default(5),
  }),
  execute: async ({ query, limit }) => {
    const results = await searchRelevantContext(query);
    if (results.length === 0) return 'No memories found for this query.';
    return results.slice(0, limit).map((r, i) =>
      `${i + 1}. [${r.type}|${r.score.toFixed(2)}] ${r.text}`
    ).join('\n');
  },
});

export const MemorySaveTool = buildTool({
  name: 'memory_save',
  description: 'Save a fact or piece of information to permanent memory.',
  isReadOnly: false,
  inputSchema: z.object({
    text: z.string().describe('Information to remember'),
    type: z.enum(['fact', 'preference', 'decision', 'skill']).default('fact'),
    importance: z.number().min(0).max(1).optional().default(0.7),
  }),
  execute: async ({ text, type, importance }) => {
    try {
      await addMemory(text, type, { source: 'manual', importance });
      return `Memory saved: "${text.slice(0, 100)}" (type: ${type}, importance: ${importance})`;
    } catch (err) {
      return `Failed to save memory: ${err instanceof Error ? err.message : String(err)}. The information was noted but not persisted.`;
    }
  },
});

export const CronCreateTool = buildTool({
  name: 'cron_create',
  description: 'Create a scheduled task (cron job).',
  isReadOnly: false,
  needsConfirmation: true,
  inputSchema: z.object({
    expression: z.string().describe('Cron expression (e.g., "0 9 * * *" for 9am daily)'),
    task: z.string().describe('Description of the task to execute'),
  }),
  execute: async ({ expression, task }) => {
    const db = getDb();
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO cron_jobs (id, expression, task_description) VALUES (?, ?, ?)')
      .run(id, expression, task);
    return `Cron job created: "${task}" at ${expression} (id: ${id.slice(0, 8)})`;
  },
});

export const CronListTool = buildTool({
  name: 'cron_list',
  description: 'List all scheduled cron jobs.',
  inputSchema: z.object({}),
  execute: async () => {
    const db = getDb();
    const jobs = db.prepare('SELECT * FROM cron_jobs ORDER BY created_at DESC').all() as Array<Record<string, unknown>>;
    if (jobs.length === 0) return 'No cron jobs scheduled.';
    return jobs.map(j =>
      `[${(j.enabled as number) ? '✓' : '✗'}] ${j.expression} → ${j.task_description} (id: ${(j.id as string).slice(0, 8)})`
    ).join('\n');
  },
});

export const CronDeleteTool = buildTool({
  name: 'cron_delete',
  description: 'Delete a scheduled cron job by ID.',
  isReadOnly: false,
  inputSchema: z.object({
    id: z.string().describe('Cron job ID (first 8 chars is enough)'),
  }),
  execute: async ({ id }) => {
    const db = getDb();
    const result = db.prepare('DELETE FROM cron_jobs WHERE id LIKE ?').run(`${id}%`);
    return result.changes > 0 ? `Cron job deleted.` : `Cron job not found.`;
  },
});
