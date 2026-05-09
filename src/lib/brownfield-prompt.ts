import type { Seed } from '../schema/seed.js';

/**
 * Build the brownfield-context block injected into the LLM-review prompt.
 *
 * Pure: takes a seed and an optional `git log --oneline` snippet, returns a
 * single string. Returns an empty string for greenfield seeds so the prompt
 * collapses cleanly.
 */
export function buildBrownfieldBlock(seed: Seed, recentLog: string = ''): string {
  const bf = seed.brownfield;
  if (!bf || bf.project_type !== 'brownfield') return '';

  const lines: string[] = ['## Brownfield context'];

  if (bf.tech_stack.trim().length > 0) {
    lines.push('', `**Tech stack:** ${bf.tech_stack}`);
  }

  if (bf.existing_patterns.length > 0) {
    lines.push('', '**Existing patterns the new code MUST follow:**');
    for (const p of bf.existing_patterns) lines.push(`- ${p}`);
  }

  if (bf.existing_dependencies.length > 0) {
    lines.push('', '**Existing dependencies (do not replace):**');
    for (const d of bf.existing_dependencies) lines.push(`- ${d}`);
  }

  if (bf.forbidden_new_dependencies) {
    lines.push('', '**Constraint:** No new dependencies may be added.');
  }

  if (bf.unresolved_gaps.length > 0) {
    lines.push('', '**Unresolved gaps from ingest (treat answers as still ambiguous):**');
    for (const g of bf.unresolved_gaps) lines.push(`- ${g}`);
  }

  const trimmedLog = recentLog.trim();
  if (trimmedLog.length > 0) {
    lines.push('', '**Recent commits touching these paths (most recent first):**');
    lines.push('```');
    lines.push(trimmedLog);
    lines.push('```');
  }

  lines.push(
    '',
    'Treat the seed as a request to extend an existing system. A diff that violates the patterns above or adds replacement frameworks should fail review even if it satisfies the AC text in isolation.',
  );

  return lines.join('\n');
}
