#!/usr/bin/env -S npx tsx
import { parseArgs, getString } from '../src/lib/args.js';
import { loadSeed } from '../src/lib/seed.js';
import { loadState, saveState } from '../src/lib/state.js';
import { rollUpStatus, walkAll } from '../src/lib/ac.js';
import { shouldTerminate, reasonToStatus } from '../src/lib/ralph.js';
import { RalphStatusSchema } from '../src/schema/state.js';

function main(): void {
  const args = parseArgs();
  const explicitReason = getString(args, 'reason');

  const seed = loadSeed();
  const state = loadState();
  if (!state.ralph) {
    throw new Error('No ralph block on state — run ralph-init first.');
  }

  state.ac_status = rollUpStatus(seed.acceptance_criteria, state.ac_status);

  let status = state.ralph.status;
  let stopReason = state.ralph.stop_reason;
  if (explicitReason) {
    status = RalphStatusSchema.parse(explicitReason);
    stopReason = explicitReason;
  } else {
    const decision = shouldTerminate(state, seed, state.ralph.config);
    if (decision.terminate) {
      status = reasonToStatus(decision.reason);
      stopReason = decision.reason;
    } else {
      // Loop ended without a hard terminate condition — caller decided to stop.
      // Record as `interrupted` so it's distinguishable from a structured exit.
      status = 'interrupted';
      stopReason = 'caller_finalized_without_terminate';
    }
  }

  state.ralph.status = status;
  state.ralph.stop_reason = stopReason;

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
        iterations: state.ralph.iterations.length,
      },
      null,
      2,
    ) + '\n',
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`ralph-finalize error: ${(err as Error).message}\n`);
  process.exit(1);
}
