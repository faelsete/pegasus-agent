import type { PegasusTool } from './base.js';
import {
  BashTool, FileReadTool, FileWriteTool, GlobTool, GrepTool,
  WebSearchTool, WebFetchTool, SystemInfoTool,
  MemorySearchTool, MemorySaveTool,
  CronCreateTool, CronListTool, CronDeleteTool,
} from './allTools.js';

// ═══════════════════════════════════════════
// Tool Registry (Claude Code pattern)
// ═══════════════════════════════════════════

/** Get all enabled tools */
export function getAllTools(): PegasusTool[] {
  return [
    BashTool,
    FileReadTool,
    FileWriteTool,
    GlobTool,
    GrepTool,
    WebSearchTool,
    WebFetchTool,
    SystemInfoTool,
    MemorySearchTool,
    MemorySaveTool,
    CronCreateTool,
    CronListTool,
    CronDeleteTool,
  ].filter(t => t.isEnabled());
}

/** Convert to AI SDK tools format */
export function getAiSdkTools(tools?: PegasusTool[]): Record<string, PegasusTool['aiSdkTool']> {
  const toolList = tools ?? getAllTools();
  return Object.fromEntries(toolList.map(t => [t.name, t.aiSdkTool]));
}
