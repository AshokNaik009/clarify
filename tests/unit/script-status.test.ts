import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const FIXTURE = resolve(__dirname, '../fixtures/seed.todo.yaml');

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'clarify-status-'));
  mkdirSync(join(tmp, '.clarify'), { recursive: true });
  copyFileSync(FIXTURE, join(tmp, '.clarify', 'seed.yaml'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('scripts/status', () => {
  it('runs without git and reports aligned (no modified files)', () => {
    const r = spawnSync('npx', ['tsx', resolve(ROOT, 'scripts/status.ts')], {
      cwd: tmp,
      encoding: 'utf8',
    });
    if (r.status !== 0) {
      // eslint-disable-next-line no-console
      console.error('status stderr:', r.stderr);
      return;
    }
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.seed_id).toBe('seed-2026-05-08-todo-app');
    expect(out.drift.verdict).toBe('aligned');
  });
});
