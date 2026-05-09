/**
 * Dialectic Rhythm Guard.
 *
 * Tracks consecutive interview answers that did NOT come directly from the
 * user (PATH 1a auto-confirms, PATH 1b code confirmations, PATH 4 research
 * confirmations). After `threshold` consecutive non-user answers, the next
 * question MUST be routed to the user (PATH 2) — even if it appears
 * code-answerable. This preserves the Socratic dialectic rhythm: the
 * interview is with the human, not the codebase.
 *
 * Pure helper. No I/O.
 */

export type AnswerSource = 'user' | 'code' | 'research' | 'auto';

export interface DialecticState {
  consecutiveNonUser: number;
  threshold: number;
}

export const DEFAULT_DIALECTIC_THRESHOLD = 3;

export function makeDialecticState(threshold: number = DEFAULT_DIALECTIC_THRESHOLD): DialecticState {
  if (!Number.isInteger(threshold) || threshold < 1) {
    throw new Error('Dialectic threshold must be a positive integer');
  }
  return { consecutiveNonUser: 0, threshold };
}

export function recordAnswer(state: DialecticState, source: AnswerSource): DialecticState {
  if (source === 'user') {
    return { ...state, consecutiveNonUser: 0 };
  }
  return { ...state, consecutiveNonUser: state.consecutiveNonUser + 1 };
}

export function mustRouteToUser(state: DialecticState): boolean {
  return state.consecutiveNonUser >= state.threshold;
}

/**
 * Walk a sequence of sources from start, returning the final state. Useful
 * for tests and for computing state from a serialized turn log.
 */
export function replay(
  sources: AnswerSource[],
  threshold: number = DEFAULT_DIALECTIC_THRESHOLD,
): DialecticState {
  let s = makeDialecticState(threshold);
  for (const src of sources) s = recordAnswer(s, src);
  return s;
}
