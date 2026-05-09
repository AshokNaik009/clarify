import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { clarifyDir, ensureClarifyDir } from './state.js';
import { SeedSchema } from '../schema/seed.js';

export const MAX_GAPS = 5;

export const GapSchema = z
  .object({
    field: z.string().min(1),
    question: z.string().min(1).max(160),
    why: z.string().max(240).default(''),
    suggested_options: z.array(z.string()).default([]),
  })
  .strict();
export type Gap = z.infer<typeof GapSchema>;

export const DraftSchema = z
  .object({
    draft_seed: SeedSchema,
    gaps: z.array(GapSchema).default([]),
  })
  .strict();
export type Draft = z.infer<typeof DraftSchema>;

export const GapAnswerSchema = z
  .object({
    field: z.string(),
    question: z.string(),
    answer: z.string(),
    deferred: z.boolean().default(false),
  })
  .strict();
export type GapAnswer = z.infer<typeof GapAnswerSchema>;

const DRAFT_FILE = 'ingest-draft.json';

export function ingestDraftPath(root: string = process.cwd()): string {
  return join(clarifyDir(root), DRAFT_FILE);
}

export interface DraftEnvelope {
  ticket_ref: string;
  ticket_text: string;
  draft: Draft;
}

export function writeDraftEnvelope(root: string, env: DraftEnvelope): string {
  ensureClarifyDir(root);
  const path = ingestDraftPath(root);
  writeFileSync(path, JSON.stringify(env, null, 2) + '\n', 'utf8');
  return path;
}

export function readDraftEnvelope(root: string = process.cwd()): DraftEnvelope {
  const path = ingestDraftPath(root);
  if (!existsSync(path)) throw new Error(`No ingest draft found at ${path}. Run \`clarify ingest <ticket>\` first.`);
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as { ticket_ref?: unknown; ticket_text?: unknown; draft?: unknown };
  const draft = DraftSchema.parse(parsed.draft);
  if (typeof parsed.ticket_ref !== 'string' || typeof parsed.ticket_text !== 'string') {
    throw new Error('Malformed ingest draft envelope (missing ticket_ref/ticket_text).');
  }
  return { ticket_ref: parsed.ticket_ref, ticket_text: parsed.ticket_text, draft };
}

export function clearDraftEnvelope(root: string = process.cwd()): void {
  const path = ingestDraftPath(root);
  if (existsSync(path)) {
    try {
      unlinkSync(path);
    } catch {
      // best-effort cleanup
    }
  }
}

/**
 * Cap gaps to MAX_GAPS. Overflow gap *questions* are returned separately so
 * the caller can stash them in `seed.brownfield.unresolved_gaps`.
 */
export function applyGapCap(gaps: Gap[]): { kept: Gap[]; overflowQuestions: string[] } {
  if (gaps.length <= MAX_GAPS) return { kept: gaps, overflowQuestions: [] };
  return {
    kept: gaps.slice(0, MAX_GAPS),
    overflowQuestions: gaps.slice(MAX_GAPS).map((g) => g.question),
  };
}
