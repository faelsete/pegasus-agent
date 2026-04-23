// ═══════════════════════════════════════════
// Custom Error Types
// ═══════════════════════════════════════════

export class PegasusError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = true,
  ) {
    super(message);
    this.name = 'PegasusError';
  }
}

export class ConfigError extends PegasusError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR', false);
    this.name = 'ConfigError';
  }
}

export class MemoryError extends PegasusError {
  constructor(message: string) {
    super(message, 'MEMORY_ERROR', true);
    this.name = 'MemoryError';
  }
}

export class ProviderError extends PegasusError {
  constructor(message: string, public readonly provider: string) {
    super(message, 'PROVIDER_ERROR', true);
    this.name = 'ProviderError';
  }
}

export class ToolError extends PegasusError {
  constructor(message: string, public readonly toolName: string) {
    super(message, 'TOOL_ERROR', true);
    this.name = 'ToolError';
  }
}

/** Safe wrapper for async operations */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  fallback: T,
  context?: string,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (context) {
      console.error(`[${context}] ${msg}`);
    }
    return fallback;
  }
}
