import type { State, RalphConfig, RalphIteration, RalphStatus } from '../schema/state.js';
import type { Seed } from '../schema/seed.js';
import { rollUpStatus, walkLeaves } from './ac.js';

export interface AcProgress {
  passed: number;
  failed: number;
  pending: number;
  failed_ac_ids: string[];
}

/**
 * Roll up leaf-AC statuses and count by bucket. Failed leaves are listed by id.
 * Skipped leaves count as `passed` for completion accounting (they don't block).
 */
export function summarizeAcProgress(state: State, seed: Seed): AcProgress {
  const rolled = rollUpStatus(seed.acceptance_criteria, state.ac_status);
  const leaves = walkLeaves(seed.acceptance_criteria);
  let passed = 0;
  let failed = 0;
  let pending = 0;
  const failedIds: string[] = [];
  for (const leaf of leaves) {
    const s = rolled[leaf.id] ?? 'pending';
    if (s === 'passed' || s === 'skipped') passed++;
    else if (s === 'failed') {
      failed++;
      failedIds.push(leaf.id);
    } else pending++;
  }
  return { passed, failed, pending, failed_ac_ids: failedIds };
}

/**
 * Termination decision. Priority order matches the plan in
 * /Users/ashoknaik/.claude/plans/context-clarify-ships-dreamy-unicorn.md:
 *
 *   1. converged                     — all root ACs passed (success)
 *   2. iteration_timeout             — most recent iteration timed out
 *   3. total_timeout                 — wall clock since started_at
 *   4. exhausted                     — iteration count >= max_iterations
 *   5. stagnated_after_unstuck       — tail-of-N all no_progress AND unstuck already attempted
 *   6. stagnated                     — same, but auto_unstuck disabled
 *   7. stagnated_pending_unstuck     — same, but auto_unstuck enabled and no attempt yet (soft signal:
 *                                       Ralph should run the unstuck escalation, then loop back)
 *
 * The function is pure: no clock except `now`, no I/O.
 */
export function shouldTerminate(
  state: State,
  seed: Seed,
  config: RalphConfig,
  now: Date = new Date(),
): { terminate: boolean; reason: RalphStatus | '' } {
  const rolled = rollUpStatus(seed.acceptance_criteria, state.ac_status);
  const allRootPassed =
    seed.acceptance_criteria.length > 0 &&
    seed.acceptance_criteria.every((ac) => rolled[ac.id] === 'passed');
  if (allRootPassed) return { terminate: true, reason: 'converged' };

  const ralph = state.ralph;
  if (!ralph) return { terminate: false, reason: '' };

  const iterations = ralph.iterations;
  const lastIter: RalphIteration | undefined = iterations[iterations.length - 1];

  if (lastIter && lastIter.action === 'iteration_timeout') {
    return { terminate: true, reason: 'iteration_timeout' };
  }

  const startedAt = Date.parse(ralph.started_at);
  if (Number.isFinite(startedAt) && now.getTime() - startedAt > config.total_timeout_ms) {
    return { terminate: true, reason: 'total_timeout' };
  }

  if (iterations.length >= config.max_iterations) {
    return { terminate: true, reason: 'exhausted' };
  }

  if (iterations.length >= config.stuck_threshold) {
    const tail = iterations.slice(-config.stuck_threshold);
    const allNoProgress = tail.every((i) => i.action === 'no_progress');
    if (allNoProgress) {
      const unstuckAttempted = state.unstuck.some((u) => u.trigger === 'ralph_stagnated');
      if (unstuckAttempted) {
        return { terminate: true, reason: 'stagnated_after_unstuck' };
      }
      if (!config.auto_unstuck) {
        return { terminate: true, reason: 'stagnated' };
      }
      return { terminate: true, reason: 'stagnated_pending_unstuck' };
    }
  }

  return { terminate: false, reason: '' };
}

/**
 * Map a `shouldTerminate` reason to the persisted RalphStatus.
 * The two are the same except `stagnated_pending_unstuck` is preserved verbatim
 * so finalize can record that the loop ended without the unstuck escalation
 * actually running (e.g. user Ctrl-C, or --no-unstuck was added mid-run).
 */
export function reasonToStatus(reason: RalphStatus | ''): RalphStatus {
  if (reason === '') return 'running';
  return reason;
}

/**
 * Count consensus="fail" rows for a given AC across the entire run.
 * Used by unstuck-record to seed `repeats` for the persona auto-pick rules.
 */
export function acFailRepeats(state: State, acId: string): number {
  return state.evaluations.filter((e) => e.ac_id === acId && e.consensus === 'fail').length;
}

/**
 * Most recently failed AC id in `state.evaluations` (chronological — last entry wins).
 * Returns undefined if no consensus="fail" rows exist.
 */
export function mostRecentFailedAcId(state: State): string | undefined {
  for (let i = state.evaluations.length - 1; i >= 0; i--) {
    const ev = state.evaluations[i];
    if (ev && ev.consensus === 'fail') return ev.ac_id;
  }
  return undefined;
}
