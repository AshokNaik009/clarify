#!/usr/bin/env -S npx tsx
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, getBool } from '../src/lib/args.js';
import {
  loadState,
  saveState,
  ensureClarifyDir,
  transcriptsDir,
  seedPath,
} from '../src/lib/state.js';
import { writeSeedYaml } from '../src/lib/seed.js';
import { renderPrompt } from '../src/lib/prompts.js';
import { oneShotJson } from '../src/lib/claude.js';
import { SeedSchema } from '../src/schema/seed.js';

function main(): void {
  const args = parseArgs();
  const dryRun = getBool(args, 'dry-run');

  ensureClarifyDir();
  const state = loadState();
  if (state.interview.turns.length === 0) {
    throw new Error('No interview turns recorded yet. Run interview-record first.');
  }

  const transcript = state.interview.turns
    .map((t, i) => `Turn ${i + 1}\nQ: ${t.q}\nA: ${t.a}`)
    .join('\n\n');

  // 1. Snapshot transcript to disk
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const transcriptPath = join(transcriptsDir(), `${ts}.md`);
  writeFileSync(
    transcriptPath,
    `# Interview transcript — ${ts}\n\n## Idea\n${state.interview.idea || '(none provided)'}\n\n## Turns\n\n${transcript}\n`,
    'utf8',
  );

  if (dryRun) {
    process.stdout.write(
      JSON.stringify({ ok: true, dry_run: true, transcript: transcriptPath }, null, 2) + '\n',
    );
    return;
  }

  // 2. Ask Claude to render seed JSON
  const prompt = renderPrompt('crystallize', {
    IDEA: state.interview.idea || '(none provided)',
    TRANSCRIPT: transcript,
    SLOTS_JSON: JSON.stringify(state.interview.slots, null, 2),
  });

  const raw = oneShotJson<unknown>(prompt, { timeoutMs: 5 * 60 * 1000 });

  // 3. Validate against zod schema
  const seed = SeedSchema.parse(raw);
  // Ensure lineage points to the snapshot we just wrote
  seed.lineage = {
    source: 'interview',
    interview_transcript: transcriptPath,
    parent_seed: null,
  };

  writeSeedYaml(seedPath(), seed);

  // 4. Mark interview completed in state
  state.interview.completed = true;
  state.seed_id = seed.id;
  state.phase = 'executing';
  saveState(state);

  process.stdout.write(
    JSON.stringify(
      { ok: true, seed_id: seed.id, seed_path: seedPath(), transcript: transcriptPath },
      null,
      2,
    ) + '\n',
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`seed-crystallize error: ${(err as Error).message}\n`);
  process.exit(1);
}
