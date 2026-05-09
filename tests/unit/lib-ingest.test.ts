import { describe, it, expect } from 'vitest';
import {
  applyGapCap,
  GapSchema,
  GapAnswerSchema,
  DraftSchema,
  MAX_GAPS,
} from '../../src/lib/ingest.js';
import { SeedSchema } from '../../src/schema/seed.js';

describe('applyGapCap', () => {
  it('returns all gaps when at or below the cap', () => {
    const gaps = Array.from({ length: MAX_GAPS }, (_, i) => ({
      field: `f-${i}`,
      question: `q-${i}?`,
      why: 'because',
      suggested_options: [],
    }));
    const r = applyGapCap(gaps);
    expect(r.kept).toHaveLength(MAX_GAPS);
    expect(r.overflowQuestions).toEqual([]);
  });

  it('truncates at MAX_GAPS and reports overflow questions verbatim', () => {
    const gaps = Array.from({ length: MAX_GAPS + 3 }, (_, i) => ({
      field: `f-${i}`,
      question: `q-${i}?`,
      why: 'because',
      suggested_options: [],
    }));
    const r = applyGapCap(gaps);
    expect(r.kept).toHaveLength(MAX_GAPS);
    expect(r.overflowQuestions).toEqual(['q-5?', 'q-6?', 'q-7?']);
  });

  it('handles an empty gap list', () => {
    const r = applyGapCap([]);
    expect(r.kept).toEqual([]);
    expect(r.overflowQuestions).toEqual([]);
  });
});

describe('GapSchema', () => {
  it('accepts a gap with suggested_options', () => {
    expect(() =>
      GapSchema.parse({
        field: 'AC-1.allowed_paths',
        question: 'Narrower?',
        why: 'precision',
        suggested_options: ['a', 'b'],
      }),
    ).not.toThrow();
  });

  it('rejects an over-long question', () => {
    expect(() =>
      GapSchema.parse({ field: 'x', question: 'q'.repeat(200), why: '', suggested_options: [] }),
    ).toThrow();
  });
});

describe('GapAnswerSchema', () => {
  it('defaults deferred to false', () => {
    const a = GapAnswerSchema.parse({ field: 'x', question: 'q?', answer: 'y' });
    expect(a.deferred).toBe(false);
  });

  it('accepts an explicit deferred answer', () => {
    const a = GapAnswerSchema.parse({ field: 'x', question: 'q?', answer: '', deferred: true });
    expect(a.deferred).toBe(true);
  });
});

describe('DraftSchema', () => {
  it('parses a draft envelope payload', () => {
    const seedJson = SeedSchema.parse({
      version: 1,
      id: 'seed-2026-05-09-test',
      created_at: '2026-05-09T10:00:00Z',
      description: 'x',
      acceptance_criteria: [{ id: 'AC-1', title: 'do', allowed_paths: ['src/**'] }],
      lineage: { source: 'ingest' },
    });
    const ok = DraftSchema.parse({ draft_seed: seedJson, gaps: [] });
    expect(ok.gaps).toEqual([]);
  });
});
