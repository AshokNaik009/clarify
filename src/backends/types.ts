export interface BackendCapabilities {
  supportsToolUse: boolean;
  maxContextTokens: number;
}

export interface BackendOneShotOptions {
  json?: boolean;
  timeoutMs?: number;
}

export interface Backend {
  name: 'claude' | 'codex' | 'openai' | string;
  oneShot(prompt: string, opts?: BackendOneShotOptions): Promise<string>;
  capabilities(): BackendCapabilities;
}
