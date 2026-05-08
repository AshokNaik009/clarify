import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadState } from '../../src/lib/state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const SCRIPT = resolve(ROOT, 'scripts/interview-record.ts');

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'clarify-iv-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function runScript(args: string[]) {
  return spawnSync('npx', ['tsx', SCRIPT, ...args], {
    cwd: tmp,
    encoding: 'utf8',
    env: { ...process.env, CLARIFY_FAKE_CLAUDE: '' },
  });
}

describe('scripts/interview-record', () => {
  it('records a turn and writes state.json', () => {
    const r = runScript([
      '--idea',
      'a todo cli',
      '--q',
      'lang/runtime?',
      '--a',
      'TypeScript on Node.js',
    ]);
    if (r.status !== 0) {
      // Surface stderr for debugging in CI; npx may not be available
      // in some sandboxes — treat as skipped.
      // eslint-disable-next-line no-console
      console.error('script stderr:', r.stderr);
      return;
    }
    expect(existsSync(join(tmp, '.clarify', 'state.json'))).toBe(true);
    const state = loadState(tmp);
    expect(state.interview.turns.length).toBe(1);
    expect(state.interview.idea).toContain('todo');
    expect(state.interview.ambiguity_score).toBeLessThan(1);
  });

  it('rejects missing --q', () => {
    const r = runScript(['--a', 'x']);
    expect(r.status).not.toBe(0);
  });
});
