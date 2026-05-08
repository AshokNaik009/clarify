#!/usr/bin/env -S npx tsx
import { parseArgs, requireString } from '../src/lib/args.js';
import { loadSeed } from '../src/lib/seed.js';
import { loadState, saveState } from '../src/lib/state.js';
import { findAC } from '../src/lib/ac.js';

function main(): void {
  const args = parseArgs();
  const acId = requireString(args, 'ac');

  const seed = loadSeed();
  const ac = findAC(seed.acceptance_criteria, acId);
  if (!ac) throw new Error(`AC not found in seed: ${acId}`);

  const state = loadState();
  const evals = state.evaluations.filter((e) => e.ac_id === acId);
  const last = evals[evals.length - 1];
  if (!last) throw new Error(`No evaluation row for ${acId}.`);

  const mechanicalAllPass =
    last.mechanical.length === 0 || last.mechanical.every((m) => m.verdict === 'pass');
  const llmPass =
    last.llm_review !== null && last.llm_review.score >= seed.thresholds.consensus_min;

  const consensus: 'pass' | 'fail' = mechanicalAllPass && llmPass ? 'pass' : 'fail';

  const idx = state.evaluations.findIndex(
    (e) => e.ac_id === acId && e.iteration === last.iteration,
  );
  if (idx === -1) throw new Error('eval row vanished between reads');
  const target = state.evaluations[idx];
  if (!target) throw new Error('eval row vanished between reads');
  target.consensus = consensus;
  target.evaluated_at = new Date().toISOString();

  state.ac_status[acId] = consensus === 'pass' ? 'passed' : 'failed';
  saveState(state);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        ac: acId,
        iteration: last.iteration,
        consensus,
        mechanical_all_pass: mechanicalAllPass,
        llm_pass: llmPass,
        ac_status: state.ac_status[acId],
      },
      null,
      2,
    ) + '\n',
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`eval-consensus error: ${(err as Error).message}\n`);
  process.exit(1);
}
