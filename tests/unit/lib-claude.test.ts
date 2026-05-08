import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { oneShot, oneShotJson, tryExtractJson } from '../../src/lib/claude.js';

const ORIG = process.env.CLARIFY_FAKE_CLAUDE;

beforeEach(() => {
  delete process.env.CLARIFY_FAKE_CLAUDE;
});

afterEach(() => {
  if (ORIG === undefined) delete process.env.CLARIFY_FAKE_CLAUDE;
  else process.env.CLARIFY_FAKE_CLAUDE = ORIG;
});

describe('tryExtractJson', () => {
  it('parses bare JSON', () => {
    const r = tryExtractJson<{ a: number }>('{"a": 1}');
    expect(r.ok && r.value.a).toBe(1);
  });

  it('strips ```json fences', () => {
    const r = tryExtractJson<{ a: number }>('```json\n{"a": 2}\n```');
    expect(r.ok && r.value.a).toBe(2);
  });

  it('finds JSON inside prose', () => {
    const r = tryExtractJson<{ b: string }>('Here you go:\n{"b": "x"}\nHope that helps.');
    expect(r.ok && r.value.b).toBe('x');
  });

  it('reports failure on no braces', () => {
    const r = tryExtractJson<unknown>('no json here');
    expect(r.ok).toBe(false);
  });
});

describe('oneShot via CLARIFY_FAKE_CLAUDE', () => {
  it('returns the fake string when env var is set', () => {
    process.env.CLARIFY_FAKE_CLAUDE = 'hello world';
    const r = oneShot('prompt');
    expect(r.text).toBe('hello world');
    expect(r.durationMs).toBe(0);
  });

  it('oneShotJson parses the fake JSON', () => {
    process.env.CLARIFY_FAKE_CLAUDE = '{"score": 0.9, "verdict": "pass", "notes": "ok"}';
    const r = oneShotJson<{ score: number; verdict: string }>('prompt');
    expect(r.score).toBe(0.9);
    expect(r.verdict).toBe('pass');
  });
});
