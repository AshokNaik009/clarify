#!/usr/bin/env -S npx tsx
import { z } from 'zod';
import { parseArgs } from '../src/lib/args.js';
import { loadSeed } from '../src/lib/seed.js';
import { loadState } from '../src/lib/state.js';
import { findAC } from '../src/lib/ac.js';
import { renderPrompt } from '../src/lib/prompts.js';
import { oneShotJson } from '../src/lib/claude.js';
import { summarizeGoalProgress } from '../src/lib/goal.js';

const RankedEntrySchema = z
  .object({
    ac_id: z.string(),
    score: z.number().min(0).max(1),
    rationale: z.string().default(''),
  })
  .strict();

const SelectorOutputSchema = z
  .object({
    ranked: z.array(RankedEntrySchema),
    top_ac_id: z.string().nullable(),
    summary: z.string().default(''),
  })
  .strict();

function main(): void {
  parseArgs(); // no required flags; --json is implicit

  const seed = loadSeed();
  const state = loadState();
  if (!state.goal) {
    throw new Error('No goal block on state — run goal-init first.');
  }

  const progress = summarizeGoalProgress(state, seed);
  if (progress.pending_ac_ids.length === 0) {
    // Nothing to rank. The goal skill will treat this as `achieved` (if all
    // root ACs passed) or `no_aligned_acs` (if everything failed).
    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          ranked: [],
          top_ac_id: null,
          alignment_min: state.goal.config.alignment_min,
          above_threshold: [],
          summary: 'No pending ACs.',
        },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  const pendingAcs = progress.pending_ac_ids
    .map((id) => findAC(seed.acceptance_criteria, id))
    .filter((ac): ac is NonNullable<typeof ac> => Boolean(ac))
    .map((ac) => ({
      id: ac.id,
      title: ac.title,
      intent: ac.intent ?? '',
      allowed_paths: ac.allowed_paths ?? [],
    }));

  const prompt = renderPrompt('select-ac-for-goal', {
    GOAL_STATEMENT: state.goal.statement,
    SEED_DESCRIPTION: seed.description,
    PENDING_ACS_JSON: JSON.stringify(pendingAcs, null, 2),
  });

  const raw = oneShotJson<unknown>(prompt, { timeoutMs: 2 * 60 * 1000 });
  const result = SelectorOutputSchema.parse(raw);

  // Drop any entries the model invented for AC ids not in the pending set.
  const validIds = new Set(progress.pending_ac_ids);
  const ranked = result.ranked
    .filter((r) => validIds.has(r.ac_id))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0] ?? null;
  const alignmentMin = state.goal.config.alignment_min;
  const aboveThreshold = ranked.filter((r) => r.score >= alignmentMin);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        ranked,
        top_ac_id: top?.ac_id ?? null,
        top_score: top?.score ?? null,
        alignment_min: alignmentMin,
        above_threshold: aboveThreshold.map((r) => r.ac_id),
        summary: result.summary,
      },
      null,
      2,
    ) + '\n',
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`goal-select-ac error: ${(err as Error).message}\n`);
  process.exit(1);
}
