#!/usr/bin/env -S npx tsx
import { readFileSync } from 'node:fs';
import { parseArgs, requireString } from '../src/lib/args.js';
import { loadSeed, writeSeedYaml, nextEvolutionPath } from '../src/lib/seed.js';
import { loadState, saveState, seedPath } from '../src/lib/state.js';
import { renderPrompt } from '../src/lib/prompts.js';
import { oneShotJson } from '../src/lib/claude.js';
import { SeedSchema } from '../src/schema/seed.js';

function main(): void {
  const args = parseArgs();
  // analysis is a path to a JSON file produced by evolve-analyze and
  // (possibly) augmented by the skill with user clarifications.
  const analysisPath = requireString(args, 'analysis');
  const clarificationsPath = (args['clarifications'] as string | undefined) ?? null;

  const seed = loadSeed();
  const seedYaml = readFileSync(seedPath(), 'utf8');
  const analysisJson = readFileSync(analysisPath, 'utf8');
  const clarificationsJson = clarificationsPath
    ? readFileSync(clarificationsPath, 'utf8')
    : '[]';

  const prompt = renderPrompt('rewrite-seed', {
    SEED_YAML: seedYaml,
    ANALYSIS_JSON: analysisJson,
    CLARIFICATIONS_JSON: clarificationsJson,
  });

  const raw = oneShotJson<unknown>(prompt, { timeoutMs: 5 * 60 * 1000 });
  const next = SeedSchema.parse(raw);

  // Always overwrite lineage to point at the parent and bump id if needed.
  next.lineage = {
    source: 'evolution',
    interview_transcript: seed.lineage.interview_transcript ?? null,
    parent_seed: seed.id,
  };
  next.created_at = new Date().toISOString();

  const { n, path } = nextEvolutionPath();
  writeSeedYaml(path, next);
  // Also overwrite the live seed.yaml so subsequent runs pick up the new spec.
  writeSeedYaml(seedPath(), next);

  const state = loadState();
  state.evolutions.push({
    n,
    seed_path: path,
    parent_seed_id: seed.id,
    created_at: next.created_at,
    reason: '',
  });
  state.seed_id = next.id;
  state.phase = 'executing';
  saveState(state);

  process.stdout.write(
    JSON.stringify(
      { ok: true, evolution_n: n, evolution_path: path, new_seed_id: next.id },
      null,
      2,
    ) + '\n',
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`evolve-rewrite-seed error: ${(err as Error).message}\n`);
  process.exit(1);
}
