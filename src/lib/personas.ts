import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import type { PersonaName } from '../schema/state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PERSONAS_DIR = resolve(__dirname, '..', 'personas');

export const PERSONA_NAMES: readonly PersonaName[] = [
  'contrarian',
  'hacker',
  'simplifier',
  'researcher',
  'architect',
] as const;

export type FailureCategory = 'under_specification' | 'contradiction' | 'implementation_bug';

/**
 * Auto-pick a persona for the given failure category.
 *
 * Mirrors ouroboros/skills/unstuck/SKILL.md auto-pick rules:
 *   - contradiction          → contrarian (challenge the spec assumption)
 *   - under_specification    → researcher (gather missing information)
 *   - implementation_bug ≥3  → architect  (structural redesign)
 *   - implementation_bug <3  → hacker     (unconventional workaround)
 *   - default                → simplifier (cut scope)
 *
 * `repeats` is the number of times the same AC has consensus="fail" in state.evaluations.
 */
export function pickPersonaForFailure(category: FailureCategory, repeats: number): PersonaName {
  if (category === 'contradiction') return 'contrarian';
  if (category === 'under_specification') return 'researcher';
  if (category === 'implementation_bug') return repeats >= 3 ? 'architect' : 'hacker';
  return 'simplifier';
}

export function loadPersonaPrompt(name: PersonaName): string {
  const path = join(PERSONAS_DIR, `${name}.md`);
  return readFileSync(path, 'utf8');
}

export function isPersonaName(value: unknown): value is PersonaName {
  return typeof value === 'string' && (PERSONA_NAMES as readonly string[]).includes(value);
}
