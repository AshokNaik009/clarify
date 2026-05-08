import { describe, it, expect } from 'vitest';
import { StateSchema } from '../../src/schema/state.js';

describe('StateSchema', () => {
  it('parses a minimal state with defaults', () => {
    const s = StateSchema.parse({
      schema_version: 1,
      started_at: '2026-05-08T10:30:00Z',
    });
    expect(s.phase).toBe('interviewing');
    expect(s.interview.turns).toEqual([]);
    expect(s.interview.ambiguity_score).toBe(1);
    expect(s.evaluations).toEqual([]);
    expect(s.drift.verdict).toBe('unknown');
  });

  it('rejects unknown phase', () => {
    expect(() =>
      StateSchema.parse({
        schema_version: 1,
        started_at: '2026-05-08T10:30:00Z',
        phase: 'wat',
      }),
    ).toThrow();
  });

  it('roundtrips evaluations & drift', () => {
    const s = StateSchema.parse({
      schema_version: 1,
      started_at: '2026-05-08T10:30:00Z',
      evaluations: [
        {
          ac_id: 'AC-1',
          iteration: 0,
          mechanical: [
            { name: 't', verdict: 'pass', exit_code: 0, duration_ms: 100, output_tail: '' },
          ],
          llm_review: { score: 0.9, verdict: 'pass', notes: '' },
          consensus: 'pass',
          evaluated_at: '2026-05-08T11:00:00Z',
        },
      ],
      drift: {
        last_checked_at: '2026-05-08T11:05:00Z',
        scope_score: 0.05,
        intent_score: null,
        verdict: 'aligned',
        findings: [],
      },
    });
    expect(s.evaluations.length).toBe(1);
    expect(s.drift.verdict).toBe('aligned');
  });

  it('rejects out-of-range scores', () => {
    expect(() =>
      StateSchema.parse({
        schema_version: 1,
        started_at: '2026-05-08T10:30:00Z',
        drift: {
          last_checked_at: null,
          scope_score: 1.2,
          intent_score: null,
          verdict: 'unknown',
          findings: [],
        },
      }),
    ).toThrow();
  });
});
