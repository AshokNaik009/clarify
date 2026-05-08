#!/usr/bin/env -S npx tsx
import { loadSeed } from '../src/lib/seed.js';
import { loadState, saveState } from '../src/lib/state.js';
import { rollUpStatus, walkAll } from '../src/lib/ac.js';

function main(): void {
  const seed = loadSeed();
  const state = loadState();

  state.ac_status = rollUpStatus(seed.acceptance_criteria, state.ac_status);

  const allRoot = seed.acceptance_criteria.every((ac) => state.ac_status[ac.id] === 'passed');
  const anyFailed = walkAll(seed.acceptance_criteria).some(
    (ac) => state.ac_status[ac.id] === 'failed',
  );

  state.phase = allRoot ? 'done' : anyFailed ? 'evolving' : 'executing';
  saveState(state);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        phase: state.phase,
        ac_status: state.ac_status,
        all_passed: allRoot,
        any_failed: anyFailed,
      },
      null,
      2,
    ) + '\n',
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`run-finalize error: ${(err as Error).message}\n`);
  process.exit(1);
}
