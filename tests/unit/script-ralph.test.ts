import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { saveState, loadState, statePath, ensureClarifyDir, emptyState } from '../../src/lib/state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const FIXTURE_FAILING = resolve(__dirname, '../fixtures/seed.failing.yaml');

let tmp: string;

function runScript(script: string, args: string[] = []): SpawnSyncReturns<string> {
  return spawnSync('npx', ['tsx', resolve(ROOT, 'scripts', script), ...args], {
    cwd: tmp,
    encoding: 'utf8',
    env: { ...process.env, CLARIFY_FAKE_CLAUDE: '{"score":0.9,"verdict":"pass","notes":"ok"}' },
  });
}

function mustOk(r: SpawnSyncReturns<string>, label: string): unknown {
  if (r.status !== 0) {
    // eslint-disable-next-line no-console
    console.error(`${label} stderr:\n${r.stderr}`);
    throw new Error(`${label} exited with status ${r.status}`);
  }
  return JSON.parse(r.stdout);
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'clarify-ralph-'));
  ensureClarifyDir(tmp);
  copyFileSync(FIXTURE_FAILING, join(tmp, '.clarify', 'seed.yaml'));
  // Seed minimal state with the AC marked failed so summarizeAcProgress reports it.
  const state = emptyState();
  state.seed_id = 'seed-2026-05-08-ralph-failing';
  state.phase = 'evaluating';
  state.ac_status = { 'AC-1': 'failed' };
  saveState(state, tmp);
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('scripts/ralph — converged smoke (Test 2)', () => {
  it('flipping AC-1 to passed mid-loop terminates as converged', () => {
    mustOk(runScript('ralph-init.ts', ['--max-iterations', '5']), 'ralph-init');

    // Simulate a successful evolve+rerun by flipping the AC to passed.
    const s1 = loadState(tmp);
    s1.ac_status = { 'AC-1': 'passed' };
    saveState(s1, tmp);

    const stepResult = mustOk(
      runScript('ralph-step.ts', ['--action', 'evaluated', '--duration-ms', '1500']),
      'ralph-step',
    ) as { terminate: boolean; reason: string };
    expect(stepResult.terminate).toBe(true);
    expect(stepResult.reason).toBe('converged');

    mustOk(runScript('ralph-finalize.ts'), 'ralph-finalize');

    const final = loadState(tmp);
    expect(final.ralph?.status).toBe('converged');
    expect(final.ralph?.iterations.length).toBe(1);
    expect(final.phase).toBe('done');
  });
});

describe('scripts/ralph — stagnation → unstuck → terminate (Test 3c)', () => {
  it('records stagnated_after_unstuck after one ralph_stagnated unstuck attempt', () => {
    mustOk(
      runScript('ralph-init.ts', ['--max-iterations', '20', '--stuck-threshold', '3']),
      'ralph-init',
    );

    // Three consecutive no_progress iterations (no AC flips).
    for (let i = 0; i < 3; i++) {
      const r = mustOk(
        runScript('ralph-step.ts', ['--action', 'no_progress', '--duration-ms', '1000']),
        `ralph-step #${i}`,
      ) as { terminate: boolean; reason: string; iteration: number };
      expect(r.iteration).toBe(i);
      if (i < 2) {
        expect(r.terminate).toBe(false);
      } else {
        expect(r.terminate).toBe(true);
        expect(r.reason).toBe('stagnated_pending_unstuck');
      }
    }

    // Unstuck escalation kicks in (manually invoked here, mirroring what the Ralph skill does).
    const unstuck = mustOk(
      runScript('unstuck-record.ts', [
        '--trigger',
        'ralph_stagnated',
        '--persona',
        'contrarian',
        '--context',
        'AC-1 stuck across 3 iterations',
        '--suggestion',
        "challenge the AC's assumption",
        '--applied',
      ]),
      'unstuck-record',
    ) as { persona: string; entries_total: number };
    expect(unstuck.persona).toBe('contrarian');
    expect(unstuck.entries_total).toBe(1);

    // One more no_progress iteration after the unstuck attempt.
    const r4 = mustOk(
      runScript('ralph-step.ts', ['--action', 'no_progress', '--duration-ms', '1000']),
      'ralph-step #3',
    ) as { terminate: boolean; reason: string };
    expect(r4.terminate).toBe(true);
    expect(r4.reason).toBe('stagnated_after_unstuck');

    mustOk(runScript('ralph-finalize.ts'), 'ralph-finalize');

    const final = loadState(tmp);
    expect(final.ralph?.status).toBe('stagnated_after_unstuck');
    expect(final.ralph?.iterations.length).toBe(4);
    expect(final.unstuck.length).toBe(1);
    expect(final.unstuck[0]?.persona).toBe('contrarian');
    expect(final.unstuck[0]?.trigger).toBe('ralph_stagnated');
    expect(final.unstuck[0]?.applied).toBe(true);
    // The failing AC must remain failed; no spurious passes.
    expect(final.ac_status['AC-1']).toBe('failed');
  });
});

describe('scripts/unstuck-record — auto-pick path', () => {
  it('without --persona, auto-picks based on --category and AC repeats', () => {
    // Seed two consensus="fail" rows on AC-1 so repeats=2 < architect threshold of 3.
    const s = loadState(tmp);
    s.evaluations = [
      {
        ac_id: 'AC-1',
        iteration: 0,
        mechanical: [],
        llm_review: null,
        consensus: 'fail',
        evaluated_at: '2026-05-08T12:00:00Z',
      },
      {
        ac_id: 'AC-1',
        iteration: 1,
        mechanical: [],
        llm_review: null,
        consensus: 'fail',
        evaluated_at: '2026-05-08T12:01:00Z',
      },
    ];
    saveState(s, tmp);

    const r = mustOk(
      runScript('unstuck-record.ts', ['--category', 'implementation_bug']),
      'unstuck-record auto-pick',
    ) as { persona: string };
    expect(r.persona).toBe('hacker');

    // After a third fail, repeats=3 → architect.
    const s2 = loadState(tmp);
    s2.evaluations.push({
      ac_id: 'AC-1',
      iteration: 2,
      mechanical: [],
      llm_review: null,
      consensus: 'fail',
      evaluated_at: '2026-05-08T12:02:00Z',
    });
    saveState(s2, tmp);

    const r2 = mustOk(
      runScript('unstuck-record.ts', ['--category', 'implementation_bug']),
      'unstuck-record architect',
    ) as { persona: string };
    expect(r2.persona).toBe('architect');
  });
});

describe('scripts/ralph — read state.json directly', () => {
  it('state.json after init contains a ralph block with the expected config', () => {
    mustOk(
      runScript('ralph-init.ts', [
        '--max-iterations',
        '7',
        '--stuck-threshold',
        '2',
        '--no-unstuck',
      ]),
      'ralph-init',
    );
    const raw = JSON.parse(readFileSync(statePath(tmp), 'utf8'));
    expect(raw.ralph.config.max_iterations).toBe(7);
    expect(raw.ralph.config.stuck_threshold).toBe(2);
    expect(raw.ralph.config.auto_unstuck).toBe(false);
    expect(raw.ralph.status).toBe('running');
  });
});
