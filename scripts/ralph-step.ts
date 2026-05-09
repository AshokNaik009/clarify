#!/usr/bin/env -S npx tsx
import { parseArgs, getString, requireString } from '../src/lib/args.js';
import { loadSeed } from '../src/lib/seed.js';
import { loadState, saveState } from '../src/lib/state.js';
import { rollUpStatus } from '../src/lib/ac.js';
import { summarizeAcProgress, shouldTerminate } from '../src/lib/ralph.js';
import { RalphIterationActionSchema, type RalphIteration } from '../src/schema/state.js';

function main(): void {
  const args = parseArgs();
  const action = RalphIterationActionSchema.parse(requireString(args, 'action'));
  const durationMs = parseInt(getString(args, 'duration-ms') ?? '0', 10);
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new Error(`--duration-ms must be a non-negative integer, got ${durationMs}`);
  }
  const notes = getString(args, 'notes') ?? '';

  const seed = loadSeed();
  const state = loadState();
  if (!state.ralph) {
    throw new Error('No ralph block on state — run ralph-init first.');
  }

  state.ac_status = rollUpStatus(seed.acceptance_criteria, state.ac_status);
  const progress = summarizeAcProgress(state, seed);

  const iteration: RalphIteration = {
    n: state.ralph.iterations.length,
    action,
    duration_ms: durationMs,
    ac_progress: { passed: progress.passed, failed: progress.failed, pending: progress.pending },
    failed_ac_ids: progress.failed_ac_ids,
    notes,
    recorded_at: new Date().toISOString(),
  };
  state.ralph.iterations.push(iteration);
  saveState(state);

  const decision = shouldTerminate(state, seed, state.ralph.config);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        iteration: iteration.n,
        action,
        ac_progress: iteration.ac_progress,
        failed_ac_ids: iteration.failed_ac_ids,
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
  process.stderr.write(`ralph-step error: ${(err as Error).message}\n`);
  process.exit(1);
}
