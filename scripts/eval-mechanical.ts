#!/usr/bin/env -S npx tsx
import { spawnSync } from 'node:child_process';
import { parseArgs, requireString } from '../src/lib/args.js';
import { loadSeed } from '../src/lib/seed.js';
import { loadState, saveState } from '../src/lib/state.js';
import { findAC } from '../src/lib/ac.js';
import type { MechanicalResult } from '../src/schema/state.js';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

function main(): void {
  const args = parseArgs();
  const acId = requireString(args, 'ac');

  const seed = loadSeed();
  const state = loadState();

  if (!findAC(seed.acceptance_criteria, acId)) {
    throw new Error(`AC not found in seed: ${acId}`);
  }

  const results: MechanicalResult[] = [];
  for (const check of seed.mechanical_checks) {
    const start = Date.now();
    const r = spawnSync('sh', ['-c', check.cmd], {
      encoding: 'utf8',
      timeout: check.timeout_ms ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: 32 * 1024 * 1024,
    });
    const duration_ms = Date.now() - start;
    const tail = (r.stdout ?? '') + (r.stderr ?? '');
    let verdict: MechanicalResult['verdict'];
    if (r.error && (r.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') verdict = 'timeout';
    else if (r.error) verdict = 'error';
    else if ((r.status ?? 1) === 0) verdict = 'pass';
    else verdict = 'fail';

    results.push({
      name: check.name,
      verdict,
      exit_code: typeof r.status === 'number' ? r.status : null,
      duration_ms,
      output_tail: tail.slice(-2000),
    });
  }

  // Find existing iteration count for this AC
  const prior = state.evaluations.filter((e) => e.ac_id === acId);
  const iteration = prior.length;

  // Stash partial mechanical results in a transient field; eval-consensus will
  // pick this up. We model this as appending an evaluation entry with
  // consensus="fail" then upgrading on consensus pass — but to keep the data
  // model honest, we just stage results inside a side-channel evaluation
  // that gets overwritten/finalized in eval-consensus.
  // Implementation: record an evaluation row with mechanical filled in,
  // llm_review=null, consensus determined at consensus stage.
  state.evaluations.push({
    ac_id: acId,
    iteration,
    mechanical: results,
    llm_review: null,
    consensus: results.every((r) => r.verdict === 'pass') ? 'pass' : 'fail',
    evaluated_at: new Date().toISOString(),
  });
  state.phase = 'evaluating';
  saveState(state);

  process.stdout.write(
    JSON.stringify({ ok: true, ac: acId, iteration, mechanical: results }, null, 2) + '\n',
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`eval-mechanical error: ${(err as Error).message}\n`);
  process.exit(1);
}
