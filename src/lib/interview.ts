import type { State, InterviewTurn } from '../schema/state.js';

export type SlotKey =
  | 'language'
  | 'runtime'
  | 'persistence'
  | 'scope'
  | 'success_criteria'
  | 'constraints';

export const SLOT_KEYS: readonly SlotKey[] = [
  'language',
  'runtime',
  'persistence',
  'scope',
  'success_criteria',
  'constraints',
] as const;

const KEYWORD_RULES: Record<SlotKey, RegExp[]> = {
  language: [
    /\b(typescript|javascript|python|ruby|go(lang)?|rust|java|kotlin|swift|c\+\+|c#|php|elixir)\b/i,
  ],
  runtime: [/\b(node\.?js|node\b|deno|bun|browser|edge|lambda|cloudflare|vercel|cli|electron)\b/i],
  persistence: [
    /\b(json|sqlite|postgres(ql)?|mysql|redis|mongo(db)?|file|in[- ]?memory|s3|disk|local ?storage)\b/i,
  ],
  scope: [/\b(single[- ]?user|multi[- ]?user|cli|web|api|library|service|app|tool|mvp|prototype)\b/i],
  success_criteria: [/\b(test|tests|pass|criter|done|accept|ship|deliver|works when|verified)\b/i],
  constraints: [
    /\b(no network|offline|max|under|less than|must not|cannot|forbidden|allowed|>= ?\d|<= ?\d)\b/i,
  ],
};

/**
 * Try to fill empty slots from a single Q/A turn. Conservative: never
 * overwrites a slot that's already set. Returns the filled slot keys.
 */
export function fillSlotsFromTurn(state: State, turn: InterviewTurn): SlotKey[] {
  const corpus = `${turn.q}\n${turn.a}`;
  const filled: SlotKey[] = [];
  for (const key of SLOT_KEYS) {
    if (state.interview.slots[key]) continue;
    const rules = KEYWORD_RULES[key];
    if (!rules) continue;
    if (rules.some((re) => re.test(corpus))) {
      state.interview.slots[key] = trimToShort(turn.a);
      filled.push(key);
    }
  }
  return filled;
}

export function computeAmbiguity(state: State): number {
  const filled = SLOT_KEYS.filter((k) => state.interview.slots[k]).length;
  const total = SLOT_KEYS.length;
  return Math.max(0, Math.min(1, 1 - filled / total));
}

function trimToShort(s: string): string {
  const compact = s.replace(/\s+/g, ' ').trim();
  return compact.length > 240 ? compact.slice(0, 237) + '…' : compact;
}

export function unfilledSlots(state: State): SlotKey[] {
  return SLOT_KEYS.filter((k) => !state.interview.slots[k]);
}
