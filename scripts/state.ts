#!/usr/bin/env -S npx tsx
/**
 * Read-only inspector. Usage:
 *   state.ts                         → full state.json
 *   state.ts --get phase             → just the value at that key (top-level)
 *   state.ts --get ac_status.AC-1    → dotted path
 *   state.ts --summary               → small human-friendly summary
 */
import { parseArgs, getString, getBool } from '../src/lib/args.js';
import { loadState } from '../src/lib/state.js';
import { existsSync } from 'node:fs';
import { seedPath } from '../src/lib/state.js';
import { loadSeed } from '../src/lib/seed.js';
import { walkAll } from '../src/lib/ac.js';

function main(): void {
  const args = parseArgs();
  const path = getString(args, 'get');
  const summary = getBool(args, 'summary');

  const state = loadState();

  if (summary) {
    const seedExists = existsSync(seedPath());
    let acSummary: Record<string, number> = {};
    if (seedExists) {
      try {
        const seed = loadSeed();
        for (const ac of walkAll(seed.acceptance_criteria)) {
          const s = state.ac_status[ac.id] ?? 'pending';
          acSummary[s] = (acSummary[s] ?? 0) + 1;
        }
      } catch {
        // bad seed; leave empty
      }
    }
    process.stdout.write(
      JSON.stringify(
        {
          phase: state.phase,
          seed_id: state.seed_id,
          seed_exists: seedExists,
          interview: {
            turns: state.interview.turns.length,
            ambiguity: state.interview.ambiguity_score,
            completed: state.interview.completed,
          },
          ac_summary: acSummary,
          drift_verdict: state.drift.verdict,
          evolutions: state.evolutions.length,
        },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  if (path) {
    const parts = path.split('.');
    let cur: unknown = state;
    for (const p of parts) {
      if (cur === null || cur === undefined) break;
      cur = (cur as Record<string, unknown>)[p];
    }
    process.stdout.write(JSON.stringify(cur ?? null, null, 2) + '\n');
    return;
  }

  process.stdout.write(JSON.stringify(state, null, 2) + '\n');
}

try {
  main();
} catch (err) {
  process.stderr.write(`state error: ${(err as Error).message}\n`);
  process.exit(1);
}
