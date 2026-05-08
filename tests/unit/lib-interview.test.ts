import { describe, it, expect } from 'vitest';
import {
  fillSlotsFromTurn,
  computeAmbiguity,
  unfilledSlots,
  SLOT_KEYS,
} from '../../src/lib/interview.js';
import { emptyState } from '../../src/lib/state.js';

describe('lib/interview', () => {
  it('fills language and runtime slots from a TS/Node answer', () => {
    const s = emptyState();
    const filled = fillSlotsFromTurn(s, { q: 'lang/runtime?', a: 'TypeScript on Node.js' });
    expect(filled).toContain('language');
    expect(filled).toContain('runtime');
    expect(s.interview.slots.language).toBeTruthy();
    expect(s.interview.slots.runtime).toBeTruthy();
  });

  it('fills persistence on file/json answers', () => {
    const s = emptyState();
    fillSlotsFromTurn(s, { q: 'storage?', a: 'JSON file in homedir' });
    expect(s.interview.slots.persistence).toBeTruthy();
  });

  it('does not overwrite already-filled slots', () => {
    const s = emptyState();
    s.interview.slots.language = 'rust';
    fillSlotsFromTurn(s, { q: 'lang?', a: 'TypeScript' });
    expect(s.interview.slots.language).toBe('rust');
  });

  it('computeAmbiguity is 1 when nothing filled, 0 when all filled', () => {
    const s = emptyState();
    expect(computeAmbiguity(s)).toBe(1);
    for (const k of SLOT_KEYS) (s.interview.slots as Record<string, string>)[k] = 'x';
    expect(computeAmbiguity(s)).toBe(0);
  });

  it('unfilledSlots reflects state', () => {
    const s = emptyState();
    s.interview.slots.language = 'ts';
    expect(unfilledSlots(s)).not.toContain('language');
    expect(unfilledSlots(s).length).toBe(SLOT_KEYS.length - 1);
  });
});
