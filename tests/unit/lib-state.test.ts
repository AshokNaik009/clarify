import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadState,
  saveState,
  emptyState,
  ensureClarifyDir,
  statePath,
} from '../../src/lib/state.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'clarify-test-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('lib/state', () => {
  it('loadState returns emptyState when file missing', () => {
    const s = loadState(tmp);
    expect(s.phase).toBe('interviewing');
    expect(s.interview.turns).toEqual([]);
  });

  it('saveState then loadState round-trips', () => {
    const s = emptyState();
    s.phase = 'executing';
    s.seed_id = 'seed-x';
    s.interview.idea = 'todo cli';
    s.interview.turns.push({ q: 'lang?', a: 'ts' });
    saveState(s, tmp);
    expect(existsSync(statePath(tmp))).toBe(true);
    const out = loadState(tmp);
    expect(out.phase).toBe('executing');
    expect(out.seed_id).toBe('seed-x');
    expect(out.interview.turns[0]?.q).toBe('lang?');
  });

  it('ensureClarifyDir creates subdirs', () => {
    ensureClarifyDir(tmp);
    expect(existsSync(join(tmp, '.clarify', 'transcripts'))).toBe(true);
    expect(existsSync(join(tmp, '.clarify', 'evolutions'))).toBe(true);
  });

  it('saveState rejects invalid state via zod', () => {
    const s = emptyState();
    // @ts-expect-error force invalid
    s.phase = 'totally-bogus';
    expect(() => saveState(s, tmp)).toThrow();
  });

  it('saveState writes pretty JSON with trailing newline', () => {
    const s = emptyState();
    saveState(s, tmp);
    const raw = readFileSync(statePath(tmp), 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw).toContain('"phase": "interviewing"');
  });
});

