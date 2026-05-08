#!/usr/bin/env -S npx tsx
import { parseArgs, requireString } from '../src/lib/args.js';
import { loadSeed } from '../src/lib/seed.js';
import { loadState, saveState } from '../src/lib/state.js';
import { findAC, effectivePaths } from '../src/lib/ac.js';
import { renderPrompt } from '../src/lib/prompts.js';
import { oneShotJson } from '../src/lib/claude.js';
import { diffForPaths } from '../src/lib/git.js';
import { LLMReviewSchema } from '../src/schema/state.js';

function main(): void {
  const args = parseArgs();
  const acId = requireString(args, 'ac');

  const seed = loadSeed();
  const ac = findAC(seed.acceptance_criteria, acId);
  if (!ac) throw new Error(`AC not found in seed: ${acId}`);

  const state = loadState();
  const evals = state.evaluations.filter((e) => e.ac_id === acId);
  const last = evals[evals.length - 1];
  if (!last) {
    throw new Error(`No mechanical results yet for ${acId}. Run eval-mechanical first.`);
  }

  const paths = effectivePaths(ac);
  const diff = diffForPaths(paths);
  const truncatedDiff = diff.length > 60_000 ? diff.slice(0, 60_000) + '\n...[truncated]\n' : diff;

  const prompt = renderPrompt('llm-review', {
    AC_ID: ac.id,
    AC_TITLE: ac.title,
    AC_INTENT: ac.intent ?? '(no explicit intent)',
    AC_PATHS: JSON.stringify(paths),
    MECHANICAL_JSON: JSON.stringify(last.mechanical, null, 2),
    DIFF: truncatedDiff || '(no diff in allowed_paths)',
  });

  const raw = oneShotJson<unknown>(prompt, { timeoutMs: 3 * 60 * 1000 });
  const review = LLMReviewSchema.parse(raw);

  // Update the most recent evaluation row in place.
  const idx = state.evaluations.findIndex(
    (e) => e.ac_id === acId && e.iteration === last.iteration,
  );
  if (idx === -1) throw new Error('eval row vanished between reads');
  const target = state.evaluations[idx];
  if (!target) throw new Error('eval row vanished between reads');
  target.llm_review = review;
  target.evaluated_at = new Date().toISOString();
  saveState(state);

  process.stdout.write(
    JSON.stringify({ ok: true, ac: acId, iteration: last.iteration, llm_review: review }, null, 2) +
      '\n',
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`eval-llm error: ${(err as Error).message}\n`);
  process.exit(1);
}
