import { spawnSync } from 'node:child_process';

export interface OneShotOptions {
  json?: boolean;
  timeoutMs?: number;
  retries?: number;
}

export interface OneShotResult {
  text: string;
  durationMs: number;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Headless Claude call. Shells out to `claude -p`. Honors CLARIFY_FAKE_CLAUDE
 * for tests/CI: when set, treats it as the literal stdout to return.
 */
export function oneShot(prompt: string, opts: OneShotOptions = {}): OneShotResult {
  const fake = process.env.CLARIFY_FAKE_CLAUDE;
  if (fake !== undefined) return { text: fake, durationMs: 0 };

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const start = Date.now();
  const fullPrompt = opts.json
    ? `${prompt}\n\nRespond with ONLY a JSON object — no prose, no fences. The first character of your response must be \`{\` and the last must be \`}\`.`
    : prompt;

  const result = spawnSync('claude', ['-p', fullPrompt], {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
  });

  const durationMs = Date.now() - start;

  if (result.error) {
    throw new Error(`claude -p failed to spawn: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `claude -p exited with status ${result.status}: ${result.stderr?.trim() ?? ''}`,
    );
  }
  return { text: (result.stdout ?? '').trim(), durationMs };
}

/**
 * One-shot LLM call expecting JSON. Tries to parse; on failure, retries once
 * with a stricter wrapper, then throws.
 */
export function oneShotJson<T>(prompt: string, opts: Omit<OneShotOptions, 'json'> = {}): T {
  const first = oneShot(prompt, { ...opts, json: true });
  const parsed = tryExtractJson<T>(first.text);
  if (parsed.ok) return parsed.value;

  const retry = oneShot(
    `${prompt}\n\nYour previous response was not valid JSON. Output ONLY the JSON object on a single line, no fences, no prose.`,
    { ...opts, json: true },
  );
  const parsedRetry = tryExtractJson<T>(retry.text);
  if (parsedRetry.ok) return parsedRetry.value;

  throw new Error(
    `claude -p did not return valid JSON after retry. First: ${truncate(first.text, 300)}; retry: ${truncate(retry.text, 300)}`,
  );
}

export function tryExtractJson<T>(
  text: string,
): { ok: true; value: T } | { ok: false; reason: string } {
  // Strip code fences if present.
  const stripped = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  // Find first '{' and matching last '}'.
  const first = stripped.indexOf('{');
  const last = stripped.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) {
    return { ok: false, reason: 'no JSON object braces found' };
  }
  const candidate = stripped.slice(first, last + 1);
  try {
    return { ok: true, value: JSON.parse(candidate) as T };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + '…';
}
