import { oneShot as headlessOneShot } from '../lib/claude.js';
import type { Backend, BackendCapabilities, BackendOneShotOptions } from './types.js';

export class ClaudeBackend implements Backend {
  readonly name = 'claude' as const;

  async oneShot(prompt: string, opts: BackendOneShotOptions = {}): Promise<string> {
    const r = headlessOneShot(prompt, {
      json: opts.json ?? false,
      timeoutMs: opts.timeoutMs ?? 5 * 60 * 1000,
    });
    return r.text;
  }

  capabilities(): BackendCapabilities {
    return { supportsToolUse: true, maxContextTokens: 200_000 };
  }
}

export function selectBackend(name: string = process.env.CLARIFY_BACKEND ?? 'claude'): Backend {
  switch (name) {
    case 'claude':
      return new ClaudeBackend();
    default:
      throw new Error(`Unknown backend: ${name}. v1 ships claude only.`);
  }
}
