#!/usr/bin/env -S npx tsx
import { parseArgs, getString, getBool } from '../src/lib/args.js';
import { loadSeed } from '../src/lib/seed.js';
import { loadState, saveState } from '../src/lib/state.js';
import { RalphConfigSchema, RalphSchema } from '../src/schema/state.js';

function parseIntFlag(v: string | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) throw new Error(`Invalid integer flag value: ${v}`);
  return n;
}

function main(): void {
  const args = parseArgs();

  const seed = loadSeed();
  const state = loadState();

  const config = RalphConfigSchema.parse({
    max_iterations: parseIntFlag(getString(args, 'max-iterations'), 10),
    per_iteration_timeout_ms: parseIntFlag(
      getString(args, 'per-iteration-timeout-ms'),
      30 * 60_000,
    ),
    total_timeout_ms: parseIntFlag(getString(args, 'total-timeout-ms'), 2 * 60 * 60_000),
    stuck_threshold: parseIntFlag(getString(args, 'stuck-threshold'), 3),
    auto_unstuck: !getBool(args, 'no-unstuck'),
  });

  state.ralph = RalphSchema.parse({
    started_at: new Date().toISOString(),
    status: 'running',
    stop_reason: '',
    iterations: [],
    config,
  });
  state.seed_id = seed.id;
  saveState(state);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        seed_id: seed.id,
        started_at: state.ralph.started_at,
        config,
      },
      null,
      2,
    ) + '\n',
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`ralph-init error: ${(err as Error).message}\n`);
  process.exit(1);
}
