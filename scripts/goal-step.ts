#!/usr/bin/env -S npx tsx
import { parseArgs, getString, requireString } from '../src/lib/args.js';
import { loadSeed } from '../src/lib/seed.js';
import { loadState, saveState } from '../src/lib/state.js';
import { rollUpStatus } from '../src/lib/ac.js';
import { summarizeGoalProgress, shouldTerminate } from '../src/lib/goal.js';
import { GoalIterationActionSchema, type GoalIteration } from '../src/schema/state.js';

function parseFloatFlag(v: string | undefined): number | null {
  if (v === undefined) return null;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) throw new Error(`Invalid float flag value: ${v}`);
  return n;
}

function main(): void {
  const args = parseArgs();
  const action = GoalIterationActionSchema.parse(requireString(args, 'action'));
  const durationMs = parseInt(getString(args, 'duration-ms') ?? '0', 10);
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new Error(`--duration-ms must be a non-negative integer, got ${durationMs}`);
  }
  const selectedAcId = getString(args, 'ac') ?? null;
  const alignmentScore = parseFloatFlag(getString(args, 'alignment-score'));
  const verdictStr = getString(args, 'verdict');
  const verdict =
    verdictStr === 'pass' || verdictStr === 'fail' ? (verdictStr as 'pass' | 'fail') : null;
  const retried = (args['retried'] as boolean | undefined) === true;
  const notes = getString(args, 'notes') ?? '';

  const seed = loadSeed();
  const state = loadState();
  if (!state.goal) {
    throw new Error('No goal block on state — run goal-init first.');
  }

  state.ac_status = rollUpStatus(seed.acceptance_criteria, state.ac_status);
  const progress = summarizeGoalProgress(state, seed);

  const iteration: GoalIteration = {
    n: state.goal.iterations.length,
    selected_ac_id: selectedAcId,
    alignment_score: alignmentScore,
    action,
    ac_verdict: verdict,
    retried,
    duration_ms: durationMs,
    notes,
    recorded_at: new Date().toISOString(),
  };
  state.goal.iterations.push(iteration);
  saveState(state);

  const decision = shouldTerminate(state, seed, state.goal.config);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        iteration: iteration.n,
        action,
        ac_progress: {
          passed: progress.passed,
          failed: progress.failed,
          pending: progress.pending,
        },
        failed_ac_ids: progress.failed_ac_ids,
        pending_ac_ids: progress.pending_ac_ids,
        terminate: decision.terminate,
        reason: decision.reason,
      },
      null,
      2,
    ) + '\n',
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`goal-step error: ${(err as Error).message}\n`);
  process.exit(1);
}
