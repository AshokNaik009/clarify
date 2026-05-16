import type { State, GoalConfig, GoalIteration, GoalStatus } from '../schema/state.js';
import type { Seed } from '../schema/seed.js';
import { rollUpStatus, walkLeaves } from './ac.js';

export interface GoalProgress {
  passed: number;
  failed: number;
  pending: number;
  failed_ac_ids: string[];
  pending_ac_ids: string[];
}

/**
 * Roll up leaf-AC statuses for the goal loop. Unlike the ralph variant we also
 * return `pending_ac_ids` so the selector script can score only the pending set.
 * Skipped leaves count as `passed` for completion accounting (same as ralph).
 */
export function summarizeGoalProgress(state: State, seed: Seed): GoalProgress {
  const rolled = rollUpStatus(seed.acceptance_criteria, state.ac_status);
  const leaves = walkLeaves(seed.acceptance_criteria);
  let passed = 0;
  let failed = 0;
  let pending = 0;
  const failedIds: string[] = [];
  const pendingIds: string[] = [];
  for (const leaf of leaves) {
    const s = rolled[leaf.id] ?? 'pending';
    if (s === 'passed' || s === 'skipped') passed++;
    else if (s === 'failed') {
      failed++;
      failedIds.push(leaf.id);
    } else {
      pending++;
      pendingIds.push(leaf.id);
    }
  }
  return {
    passed,
    failed,
    pending,
    failed_ac_ids: failedIds,
    pending_ac_ids: pendingIds,
  };
}

/**
 * Termination decision for the goal loop. Priority order:
 *
 *   1. achieved              — all root ACs passed (the seed is done)
 *   2. iteration_timeout     — most recent iteration timed out
 *   3. total_timeout         — wall clock since started_at
 *   4. exhausted             — iteration count >= max_iterations
 *   5. no_aligned_acs        — last iteration recorded action=no_aligned_ac
 *                              (selector said nothing pending scored above
 *                               alignment_min; let caller decide whether to
 *                               solicit a new goal)
 *
 * The function is pure: no clock except `now`, no I/O. Caller handles
 * `abandoned` (user said stop) by passing an explicit reason to finalize.
 */
export function shouldTerminate(
  state: State,
  seed: Seed,
  config: GoalConfig,
  now: Date = new Date(),
): { terminate: boolean; reason: GoalStatus | '' } {
  const rolled = rollUpStatus(seed.acceptance_criteria, state.ac_status);
  const allRootPassed =
    seed.acceptance_criteria.length > 0 &&
    seed.acceptance_criteria.every((ac) => rolled[ac.id] === 'passed');
  if (allRootPassed) return { terminate: true, reason: 'achieved' };

  const goal = state.goal;
  if (!goal) return { terminate: false, reason: '' };

  const iterations = goal.iterations;
  const lastIter: GoalIteration | undefined = iterations[iterations.length - 1];

  if (lastIter && lastIter.action === 'iteration_timeout') {
    return { terminate: true, reason: 'iteration_timeout' };
  }

  const startedAt = Date.parse(goal.started_at);
  if (Number.isFinite(startedAt) && now.getTime() - startedAt > config.total_timeout_ms) {
    return { terminate: true, reason: 'total_timeout' };
  }

  if (iterations.length >= config.max_iterations) {
    return { terminate: true, reason: 'exhausted' };
  }

  if (lastIter && lastIter.action === 'no_aligned_ac') {
    return { terminate: true, reason: 'no_aligned_acs' };
  }

  return { terminate: false, reason: '' };
}

/**
 * Map a `shouldTerminate` reason to the persisted GoalStatus. `''` means the
 * loop ended without a structured terminate (e.g. user said stop) — record as
 * `abandoned` if no explicit reason was passed.
 */
export function reasonToStatus(reason: GoalStatus | ''): GoalStatus {
  if (reason === '') return 'running';
  return reason;
}
