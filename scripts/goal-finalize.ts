#!/usr/bin/env -S npx tsx
import { parseArgs, getString } from '../src/lib/args.js';
import { loadSeed } from '../src/lib/seed.js';
import { loadState, saveState } from '../src/lib/state.js';
import { rollUpStatus, walkAll } from '../src/lib/ac.js';
import { shouldTerminate, reasonToStatus } from '../src/lib/goal.js';
import { GoalStatusSchema } from '../src/schema/state.js';

function main(): void {
  const args = parseArgs();
  const explicitReason = getString(args, 'reason');

  const seed = loadSeed();
  const state = loadState();
  if (!state.goal) {
    throw new Error('No goal block on state — run goal-init first.');
  }

  state.ac_status = rollUpStatus(seed.acceptance_criteria, state.ac_status);

  let status = state.goal.status;
  let stopReason = state.goal.stop_reason;
  if (explicitReason) {
    status = GoalStatusSchema.parse(explicitReason);
    stopReason = explicitReason;
  } else {
    const decision = shouldTerminate(state, seed, state.goal.config);
    if (decision.terminate) {
      status = reasonToStatus(decision.reason);
      stopReason = decision.reason;
    } else {
      // Loop ended without a structured terminate (e.g. user said stop).
      // Record as `abandoned` so it's distinguishable from a hard exit.
      status = 'abandoned';
      stopReason = 'user_stopped_without_terminate';
    }
  }

  state.goal.status = status;
  state.goal.stop_reason = stopReason;

  // Close the active history slice if we still have a `running` statement.
  if (status !== 'running') {
    const open = state.goal.history.findIndex((h) => h.ended_at === null);
    if (open === -1) {
      state.goal.history.push({
        statement: state.goal.statement,
        started_at: state.goal.started_at,
        ended_at: new Date().toISOString(),
        reason: stopReason,
      });
    }
  }

  const allRootPassed = seed.acceptance_criteria.every(
    (ac) => state.ac_status[ac.id] === 'passed',
  );
  const anyFailed = walkAll(seed.acceptance_criteria).some(
    (ac) => state.ac_status[ac.id] === 'failed',
  );
  state.phase = allRootPassed ? 'done' : anyFailed ? 'evolving' : 'executing';

  saveState(state);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        status,
        stop_reason: stopReason,
        phase: state.phase,
        iterations: state.goal.iterations.length,
        statement: state.goal.statement,
      },
      null,
      2,
    ) + '\n',
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`goal-finalize error: ${(err as Error).message}\n`);
  process.exit(1);
}
