import { describe, it, expect } from 'vitest';
import {
  shouldTerminate,
  summarizeAcProgress,
  mostRecentFailedAcId,
  acFailRepeats,
  reasonToStatus,
} from '../../src/lib/ralph.js';
import type { State, Ralph, RalphConfig, RalphIteration } from '../../src/schema/state.js';
import type { Seed } from '../../src/schema/seed.js';

const SINGLE_AC_SEED: Seed = {
  version: 1,
  id: 'seed-test-ralph',
  created_at: '2026-05-08T12:00:00Z',
  backend: 'claude',
  description: 'test',
  constraints: { forbidden_paths: [], allowed_globals: [] },
  acceptance_criteria: [
    { id: 'AC-1', title: 'only AC', allowed_paths: ['src/**'] },
  ],
  mechanical_checks: [],
  thresholds: {
    ambiguity_max: 0.2,
    consensus_min: 0.8,
    drift_warn: 0.3,
    drift_fail: 0.7,
    max_evolutions: 3,
  },
  lineage: { source: 'manual' },
};

const DEFAULT_CONFIG: RalphConfig = {
  max_iterations: 10,
  per_iteration_timeout_ms: 30 * 60_000,
  total_timeout_ms: 2 * 60 * 60_000,
  stuck_threshold: 3,
  auto_unstuck: true,
};

const NOW_ISO = new Date().toISOString();

function noProgressIter(n: number, ts: string = NOW_ISO): RalphIteration {
  return {
    n,
    action: 'no_progress',
    duration_ms: 1000,
    ac_progress: { passed: 0, failed: 1, pending: 0 },
    failed_ac_ids: ['AC-1'],
    notes: '',
    recorded_at: ts,
  };
}

function makeRalph(iterations: RalphIteration[], overrides: Partial<Ralph> = {}): Ralph {
  return {
    started_at: NOW_ISO,
    status: 'running',
    stop_reason: '',
    iterations,
    config: DEFAULT_CONFIG,
    ...overrides,
  } as Ralph;
}

function baseState(ralph?: Ralph, ac_status: Record<string, 'pending' | 'passed' | 'failed' | 'in_progress' | 'skipped'> = { 'AC-1': 'pending' }): State {
  return {
    schema_version: 1,
    seed_id: 'seed-test-ralph',
    phase: 'executing',
    started_at: '2026-05-08T12:00:00Z',
    interview: {
      idea: '',
      turns: [],
      slots: {
        language: null,
        runtime: null,
        persistence: null,
        scope: null,
        success_criteria: null,
        constraints: null,
      },
      ambiguity_score: 1,
      completed: false,
    },
    ac_status,
    evaluations: [],
    drift: {
      last_checked_at: null,
      scope_score: null,
      intent_score: null,
      verdict: 'unknown',
      findings: [],
    },
    evolutions: [],
    ...(ralph ? { ralph } : {}),
    unstuck: [],
  };
}

describe('shouldTerminate — converged beats everything', () => {
  it('all root ACs passed → converged, regardless of iteration count or clock', () => {
    const state = baseState(
      makeRalph(
        [noProgressIter(0), noProgressIter(1), noProgressIter(2), noProgressIter(3)],
        { config: { ...DEFAULT_CONFIG, max_iterations: 1 } },
      ),
      { 'AC-1': 'passed' },
    );
    const farFuture = new Date('2099-01-01T00:00:00Z');
    const decision = shouldTerminate(state, SINGLE_AC_SEED, state.ralph!.config, farFuture);
    expect(decision).toEqual({ terminate: true, reason: 'converged' });
  });

  it('without ralph block, converged still wins when all root ACs pass', () => {
    const state = baseState(undefined, { 'AC-1': 'passed' });
    const decision = shouldTerminate(state, SINGLE_AC_SEED, DEFAULT_CONFIG);
    expect(decision).toEqual({ terminate: true, reason: 'converged' });
  });

  it('without ralph block and not converged, returns no terminate', () => {
    const state = baseState(undefined, { 'AC-1': 'failed' });
    const decision = shouldTerminate(state, SINGLE_AC_SEED, DEFAULT_CONFIG);
    expect(decision).toEqual({ terminate: false, reason: '' });
  });
});

describe('shouldTerminate — stagnation handling', () => {
  it('3 consecutive no_progress + auto_unstuck + no prior unstuck → stagnated_pending_unstuck', () => {
    const ralph = makeRalph([noProgressIter(0), noProgressIter(1), noProgressIter(2)]);
    const state = baseState(ralph, { 'AC-1': 'failed' });
    const decision = shouldTerminate(state, SINGLE_AC_SEED, ralph.config);
    expect(decision).toEqual({ terminate: true, reason: 'stagnated_pending_unstuck' });
  });

  it('3 consecutive no_progress + prior ralph_stagnated unstuck attempt → stagnated_after_unstuck', () => {
    const ralph = makeRalph([noProgressIter(0), noProgressIter(1), noProgressIter(2)]);
    const state = baseState(ralph, { 'AC-1': 'failed' });
    state.unstuck = [
      {
        persona: 'contrarian',
        trigger: 'ralph_stagnated',
        context: 'test',
        suggestion: 'invert the assumption',
        applied: true,
        recorded_at: '2026-05-08T12:30:00Z',
      },
    ];
    const decision = shouldTerminate(state, SINGLE_AC_SEED, ralph.config);
    expect(decision).toEqual({ terminate: true, reason: 'stagnated_after_unstuck' });
  });

  it('3 consecutive no_progress + auto_unstuck=false → stagnated (no escalation)', () => {
    const config = { ...DEFAULT_CONFIG, auto_unstuck: false };
    const ralph = makeRalph(
      [noProgressIter(0), noProgressIter(1), noProgressIter(2)],
      { config },
    );
    const state = baseState(ralph, { 'AC-1': 'failed' });
    const decision = shouldTerminate(state, SINGLE_AC_SEED, ralph.config);
    expect(decision).toEqual({ terminate: true, reason: 'stagnated' });
  });

  it('manual unstuck does NOT count as a ralph_stagnated attempt', () => {
    const ralph = makeRalph([noProgressIter(0), noProgressIter(1), noProgressIter(2)]);
    const state = baseState(ralph, { 'AC-1': 'failed' });
    state.unstuck = [
      {
        persona: 'simplifier',
        trigger: 'manual',
        context: '',
        suggestion: '',
        applied: false,
        recorded_at: '2026-05-08T12:30:00Z',
      },
    ];
    const decision = shouldTerminate(state, SINGLE_AC_SEED, ralph.config);
    expect(decision.reason).toBe('stagnated_pending_unstuck');
  });

  it('non-no_progress in tail breaks the streak', () => {
    const ralph = makeRalph([
      noProgressIter(0),
      { ...noProgressIter(1), action: 'rewrote_seed' },
      noProgressIter(2),
    ]);
    const state = baseState(ralph, { 'AC-1': 'failed' });
    const decision = shouldTerminate(state, SINGLE_AC_SEED, ralph.config);
    expect(decision.terminate).toBe(false);
  });
});

describe('shouldTerminate — caps and timeouts', () => {
  it('iterations.length >= max_iterations → exhausted', () => {
    const ralph = makeRalph(
      [
        { ...noProgressIter(0), action: 'evaluated' },
        { ...noProgressIter(1), action: 'evaluated' },
        { ...noProgressIter(2), action: 'evaluated' },
      ],
      { config: { ...DEFAULT_CONFIG, max_iterations: 3 } },
    );
    const state = baseState(ralph, { 'AC-1': 'failed' });
    const decision = shouldTerminate(state, SINGLE_AC_SEED, ralph.config);
    expect(decision).toEqual({ terminate: true, reason: 'exhausted' });
  });

  it('total_timeout fires when wall-clock exceeds cap', () => {
    const ralph = makeRalph([{ ...noProgressIter(0), action: 'evaluated' }]);
    const state = baseState(ralph, { 'AC-1': 'failed' });
    const fiveHoursLater = new Date(Date.parse(ralph.started_at) + 5 * 60 * 60_000);
    const decision = shouldTerminate(state, SINGLE_AC_SEED, ralph.config, fiveHoursLater);
    expect(decision).toEqual({ terminate: true, reason: 'total_timeout' });
  });

  it('iteration_timeout action on most recent iteration → iteration_timeout', () => {
    const ralph = makeRalph([
      { ...noProgressIter(0), action: 'evaluated' },
      { ...noProgressIter(1), action: 'iteration_timeout' },
    ]);
    const state = baseState(ralph, { 'AC-1': 'failed' });
    const decision = shouldTerminate(state, SINGLE_AC_SEED, ralph.config);
    expect(decision).toEqual({ terminate: true, reason: 'iteration_timeout' });
  });
});

describe('summarizeAcProgress', () => {
  it('counts leaves and lists failing ids', () => {
    const seed: Seed = {
      ...SINGLE_AC_SEED,
      acceptance_criteria: [
        {
          id: 'AC-1',
          title: 'parent',
          allowed_paths: [],
          children: [
            { id: 'AC-1.1', title: 'leaf a', allowed_paths: ['src/a.ts'] },
            { id: 'AC-1.2', title: 'leaf b', allowed_paths: ['src/b.ts'] },
          ],
        },
        { id: 'AC-2', title: 'standalone leaf', allowed_paths: ['lib/**'] },
      ],
    };
    const state = baseState(undefined, {
      'AC-1.1': 'passed',
      'AC-1.2': 'failed',
      'AC-2': 'pending',
    });
    const progress = summarizeAcProgress(state, seed);
    expect(progress).toEqual({
      passed: 1,
      failed: 1,
      pending: 1,
      failed_ac_ids: ['AC-1.2'],
    });
  });
});

describe('mostRecentFailedAcId / acFailRepeats', () => {
  it('finds the latest fail and counts repeats per AC', () => {
    const state = baseState();
    state.evaluations = [
      {
        ac_id: 'AC-1',
        iteration: 0,
        mechanical: [],
        llm_review: null,
        consensus: 'fail',
        evaluated_at: '2026-05-08T12:00:00Z',
      },
      {
        ac_id: 'AC-2',
        iteration: 0,
        mechanical: [],
        llm_review: null,
        consensus: 'pass',
        evaluated_at: '2026-05-08T12:01:00Z',
      },
      {
        ac_id: 'AC-1',
        iteration: 1,
        mechanical: [],
        llm_review: null,
        consensus: 'fail',
        evaluated_at: '2026-05-08T12:02:00Z',
      },
    ];
    expect(mostRecentFailedAcId(state)).toBe('AC-1');
    expect(acFailRepeats(state, 'AC-1')).toBe(2);
    expect(acFailRepeats(state, 'AC-2')).toBe(0);
    expect(acFailRepeats(state, 'AC-NEVER')).toBe(0);
  });

  it('returns undefined when no failures', () => {
    expect(mostRecentFailedAcId(baseState())).toBeUndefined();
  });
});

describe('reasonToStatus', () => {
  it('maps empty reason to running, otherwise passes through', () => {
    expect(reasonToStatus('')).toBe('running');
    expect(reasonToStatus('converged')).toBe('converged');
    expect(reasonToStatus('stagnated_after_unstuck')).toBe('stagnated_after_unstuck');
  });
});
