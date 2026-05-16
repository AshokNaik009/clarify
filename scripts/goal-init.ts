#!/usr/bin/env -S npx tsx
import { parseArgs, getString, requireString } from '../src/lib/args.js';
import { loadSeed } from '../src/lib/seed.js';
import { loadState, saveState } from '../src/lib/state.js';
import { GoalConfigSchema, GoalSchema } from '../src/schema/state.js';

function parseIntFlag(v: string | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) throw new Error(`Invalid integer flag value: ${v}`);
  return n;
}

function parseFloatFlag(v: string | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) throw new Error(`Invalid float flag value: ${v}`);
  return n;
}

function main(): void {
  const args = parseArgs();
  const statement = requireString(args, 'goal').trim();
  if (statement.length === 0) {
    throw new Error('--goal must be a non-empty string');
  }

  const seed = loadSeed();
  const state = loadState();

  const config = GoalConfigSchema.parse({
    max_iterations: parseIntFlag(getString(args, 'max-iterations'), 10),
    per_iteration_timeout_ms: parseIntFlag(
      getString(args, 'per-iteration-timeout-ms'),
      30 * 60_000,
    ),
    total_timeout_ms: parseIntFlag(getString(args, 'total-timeout-ms'), 2 * 60 * 60_000),
    alignment_min: parseFloatFlag(getString(args, 'alignment-min'), 0.5),
  });

  const startedAt = new Date().toISOString();

  if (state.goal && state.goal.status === 'running') {
    // Mid-run goal change: archive the previous statement into history.
    state.goal.history.push({
      statement: state.goal.statement,
      started_at: state.goal.started_at,
      ended_at: startedAt,
      reason: 'goal_changed',
    });
    state.goal.statement = statement;
    state.goal.config = config;
    // Keep iterations + started_at so the run log stays continuous.
  } else {
    state.goal = GoalSchema.parse({
      statement,
      started_at: startedAt,
      status: 'running',
      stop_reason: '',
      iterations: [],
      config,
      history: [],
    });
  }
  state.seed_id = seed.id;
  saveState(state);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        seed_id: seed.id,
        statement: state.goal.statement,
        started_at: state.goal.started_at,
        config,
        history_length: state.goal.history.length,
      },
      null,
      2,
    ) + '\n',
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`goal-init error: ${(err as Error).message}\n`);
  process.exit(1);
}
