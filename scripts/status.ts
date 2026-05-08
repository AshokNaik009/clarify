#!/usr/bin/env -S npx tsx
import { readFileSync, existsSync } from 'node:fs';
import { z } from 'zod';
import { parseArgs, getBool } from '../src/lib/args.js';
import { loadSeed } from '../src/lib/seed.js';
import { loadState, saveState, seedPath } from '../src/lib/state.js';
import { walkAll, pathCoveredByAnyAC } from '../src/lib/ac.js';
import { modifiedFiles, diffForPaths, isGitRepo } from '../src/lib/git.js';
import { renderPrompt } from '../src/lib/prompts.js';
import { oneShotJson } from '../src/lib/claude.js';

const IntentDriftSchema = z.object({
  score: z.number().min(0).max(1),
  narrative: z.string().default(''),
});

function main(): void {
  const args = parseArgs();
  const deep = getBool(args, 'deep');
  const since = (args['since'] as string | undefined) ?? 'HEAD~1';

  const seed = loadSeed();
  const state = loadState();

  const modified = isGitRepo() ? modifiedFiles(since) : [];
  const rogue = modified.filter((f) => !pathCoveredByAnyAC(f, seed.acceptance_criteria));
  const scopeScore = modified.length === 0 ? 0 : rogue.length / modified.length;

  let intentScore: number | null = null;
  let narrative = '';
  if (deep) {
    const seedYaml = readFileSync(seedPath(), 'utf8');
    const diff = diffForPaths(modified);
    const prompt = renderPrompt('intent-drift', {
      SEED_YAML: seedYaml,
      DIFF: diff.length > 40_000 ? diff.slice(0, 40_000) + '\n...[truncated]\n' : diff,
      MODIFIED_FILES_JSON: JSON.stringify(modified, null, 2),
    });
    const raw = oneShotJson<unknown>(prompt, { timeoutMs: 3 * 60 * 1000 });
    const parsed = IntentDriftSchema.parse(raw);
    intentScore = parsed.score;
    narrative = parsed.narrative;
  }

  const worst = Math.max(scopeScore, intentScore ?? 0);
  const verdict: 'aligned' | 'drifting' | 'diverged' =
    worst >= seed.thresholds.drift_fail
      ? 'diverged'
      : worst >= seed.thresholds.drift_warn
        ? 'drifting'
        : 'aligned';

  state.drift = {
    last_checked_at: new Date().toISOString(),
    scope_score: scopeScore,
    intent_score: intentScore,
    verdict,
    findings: rogue.map((f) => `rogue:${f}`).concat(narrative ? [`intent:${narrative}`] : []),
  };
  saveState(state);

  // AC progress summary.
  const acSummary: Record<string, number> = {};
  for (const ac of walkAll(seed.acceptance_criteria)) {
    const s = state.ac_status[ac.id] ?? 'pending';
    acSummary[s] = (acSummary[s] ?? 0) + 1;
  }

  const report = {
    ok: true,
    seed_id: seed.id,
    phase: state.phase,
    ac_summary: acSummary,
    drift: state.drift,
    rogue_files: rogue,
    seed_path_exists: existsSync(seedPath()),
  };

  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

try {
  main();
} catch (err) {
  process.stderr.write(`status error: ${(err as Error).message}\n`);
  process.exit(1);
}
