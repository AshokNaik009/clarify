import { describe, it, expect } from 'vitest';
import {
  makeDialecticState,
  recordAnswer,
  mustRouteToUser,
  replay,
  DEFAULT_DIALECTIC_THRESHOLD,
} from '../../src/lib/dialectic.js';

describe('dialectic rhythm guard', () => {
  it('starts with counter at 0 and does not require routing', () => {
    const s = makeDialecticState();
    expect(s.consecutiveNonUser).toBe(0);
    expect(mustRouteToUser(s)).toBe(false);
  });

  it('three consecutive non-user answers triggers mustRouteToUser', () => {
    const s = replay(['code', 'code', 'auto']);
    expect(s.consecutiveNonUser).toBe(3);
    expect(mustRouteToUser(s)).toBe(true);
  });

  it('user answer resets the counter', () => {
    const s = replay(['code', 'code', 'user']);
    expect(s.consecutiveNonUser).toBe(0);
    expect(mustRouteToUser(s)).toBe(false);
  });

  it('research counts as non-user', () => {
    const s = replay(['research', 'research', 'research']);
    expect(s.consecutiveNonUser).toBe(3);
    expect(mustRouteToUser(s)).toBe(true);
  });

  it('mixed sequence: 2 non-user then user resets, then 3 non-user trips again', () => {
    let s = replay(['code', 'auto', 'user']);
    expect(mustRouteToUser(s)).toBe(false);
    s = recordAnswer(s, 'code');
    s = recordAnswer(s, 'auto');
    s = recordAnswer(s, 'research');
    expect(mustRouteToUser(s)).toBe(true);
  });

  it('default threshold is 3', () => {
    expect(DEFAULT_DIALECTIC_THRESHOLD).toBe(3);
  });

  it('custom threshold works', () => {
    const s = replay(['code'], 1);
    expect(mustRouteToUser(s)).toBe(true);
  });

  it('rejects non-positive threshold', () => {
    expect(() => makeDialecticState(0)).toThrow();
    expect(() => makeDialecticState(-1)).toThrow();
  });
});
