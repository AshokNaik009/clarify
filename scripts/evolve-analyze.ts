#!/usr/bin/env -S npx tsx
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { loadSeed } from '../src/lib/seed.js';
import { loadState, seedPath } from '../src/lib/state.js';
import { renderPrompt } from '../src/lib/prompts.js';
import { oneShotJson } from '../src/lib/claude.js';
import { diffForPaths } from '../src/lib/git.js';
import { effectivePaths, findAC } from '../src/lib/ac.js';

const AnalysisSchema = z.object({
  category: z.enum([
    'under_specification',
    'contradiction',
    'implementation_bug',
    'pre_existing_behavior',
  ]),
  summary: z.string(),
  affected_ac_ids: z.array(z.string()),
  questions_for_user: z.array(z.string()).max(3).default([]),
  suggested_fix: z.string().default(''),
});
export type FailureAnalysis = z.infer<typeof AnalysisSchema>;

function main(): void {
  const seed = loadSeed();
  const state = loadState();

  const lastByAc = new Map<string, (typeof state.evaluations)[number]>();
  for (const e of state.evaluations) lastByAc.set(e.ac_id, e);
  const failed = Array.from(lastByAc.values()).filter((e) => e.consensus === 'fail');
  if (failed.length === 0) {
    process.stdout.write(JSON.stringify({ ok: true, no_failures: true }, null, 2) + '\n');
    return;
  }

  const allPaths = new Set<string>();
  for (const e of failed) {
    const ac = findAC(seed.acceptance_criteria, e.ac_id);
    if (ac) for (const p of effectivePaths(ac)) allPaths.add(p);
  }
  const diff = diffForPaths(Array.from(allPaths));
  const seedYaml = readFileSync(seedPath(), 'utf8');

  const prompt = renderPrompt('analyze-failure', {
    SEED_YAML: seedYaml,
    FAILED_EVALS_JSON: JSON.stringify(failed, null, 2),
    DIFF: diff.length > 40_000 ? diff.slice(0, 40_000) + '\n...[truncated]\n' : diff,
  });

  const raw = oneShotJson<unknown>(prompt, { timeoutMs: 3 * 60 * 1000 });
  const analysis = AnalysisSchema.parse(raw);

  process.stdout.write(JSON.stringify({ ok: true, analysis }, null, 2) + '\n');
}

try {
  main();
} catch (err) {
  process.stderr.write(`evolve-analyze error: ${(err as Error).message}\n`);
  process.exit(1);
}
