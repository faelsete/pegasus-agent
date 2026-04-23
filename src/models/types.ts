// ═══════════════════════════════════════════
// Model Types
// ═══════════════════════════════════════════

export type TaskType = 'text' | 'fast' | 'embed' | 'image' | 'code';

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextLength?: number;
  pricing?: {
    prompt: number;
    completion: number;
  };
}
