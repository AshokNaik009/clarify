#!/usr/bin/env -S npx tsx
import { parseArgs, requireString, getString } from '../src/lib/args.js';
import { loadState, saveState, ensureClarifyDir } from '../src/lib/state.js';
import { fillSlotsFromTurn, computeAmbiguity, unfilledSlots } from '../src/lib/interview.js';

function main(): void {
  const args = parseArgs();
  const q = requireString(args, 'q');
  const a = requireString(args, 'a');
  const idea = getString(args, 'idea');

  ensureClarifyDir();
  const state = loadState();
  if (state.phase !== 'interviewing' && state.phase !== 'crystallizing') {
    state.phase = 'interviewing';
  }
  if (idea && !state.interview.idea) state.interview.idea = idea;

  const turn = { q, a, asked_at: new Date().toISOString() };
  state.interview.turns.push(turn);
  fillSlotsFromTurn(state, turn);
  state.interview.ambiguity_score = computeAmbiguity(state);

  saveState(state);

  const remaining = unfilledSlots(state);
  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        ambiguity_score: state.interview.ambiguity_score,
        turns: state.interview.turns.length,
        slots: state.interview.slots,
        unfilled_slots: remaining,
      },
      null,
      2,
    ) + '\n',
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`interview-record error: ${(err as Error).message}\n`);
  process.exit(1);
}
