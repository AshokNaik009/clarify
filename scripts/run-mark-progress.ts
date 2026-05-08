#!/usr/bin/env -S npx tsx
import { parseArgs, requireString } from '../src/lib/args.js';
import { loadState, saveState } from '../src/lib/state.js';
import { ACStatusSchema } from '../src/schema/state.js';
import { loadSeed } from '../src/lib/seed.js';
import { findAC } from '../src/lib/ac.js';

function main(): void {
  const args = parseArgs();
  const acId = requireString(args, 'ac');
  const status = ACStatusSchema.parse(requireString(args, 'status'));

  const seed = loadSeed();
  if (!findAC(seed.acceptance_criteria, acId)) {
    throw new Error(`AC not found in seed: ${acId}`);
  }

  const state = loadState();
  state.ac_status[acId] = status;
  saveState(state);

  process.stdout.write(JSON.stringify({ ok: true, ac: acId, status }, null, 2) + '\n');
}

try {
  main();
} catch (err) {
  process.stderr.write(`run-mark-progress error: ${(err as Error).message}\n`);
  process.exit(1);
}
