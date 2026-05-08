#!/usr/bin/env -S npx tsx
import { loadSeed } from '../src/lib/seed.js';
import { loadState, saveState, ensureClarifyDir } from '../src/lib/state.js';
import { walkLeaves, walkAll } from '../src/lib/ac.js';
import type { ACStatus } from '../src/schema/state.js';

function main(): void {
  ensureClarifyDir();
  const seed = loadSeed();
  const state = loadState();

  state.seed_id = seed.id;
  state.phase = 'executing';

  const status: Record<string, ACStatus> = { ...state.ac_status };
  for (const ac of walkAll(seed.acceptance_criteria)) {
    if (!status[ac.id]) status[ac.id] = 'pending';
  }
  state.ac_status = status;

  saveState(state);

  const leaves = walkLeaves(seed.acceptance_criteria);
  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        seed_id: seed.id,
        leaf_acs: leaves.map((l) => ({ id: l.id, title: l.title, allowed_paths: l.allowed_paths })),
      },
      null,
      2,
    ) + '\n',
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`run-init error: ${(err as Error).message}\n`);
  process.exit(1);
}
