#!/usr/bin/env -S npx tsx
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import { parseArgs, getString } from '../src/lib/args.js';
import { ensureClarifyDir, loadState, saveState, seedPath } from '../src/lib/state.js';
import { writeSeedYaml } from '../src/lib/seed.js';
import { oneShotJson } from '../src/lib/claude.js';
import { SeedSchema } from '../src/schema/seed.js';
import {
  GapAnswerSchema,
  type GapAnswer,
  readDraftEnvelope,
  clearDraftEnvelope,
} from '../src/lib/ingest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PERSONA_PATH = resolve(__dirname, '..', 'src', 'personas', 'seed-architect.md');

const AnswersSchema = z.array(GapAnswerSchema);

function readAnswers(args: ReturnType<typeof parseArgs>, cwd: string): GapAnswer[] {
  const filePath = getString(args, 'answers');
  const inline = getString(args, 'answers-inline');
  let raw: string;
  if (filePath) {
    const abs = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
    if (!existsSync(abs)) throw new Error(`Answers file not found: ${abs}`);
    raw = readFileSync(abs, 'utf8');
  } else if (inline) {
    raw = inline;
  } else {
    throw new Error('Provide gap answers via --answers <path> or --answers-inline <json>.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Could not parse answers JSON: ${(err as Error).message}`);
  }
  return AnswersSchema.parse(parsed);
}

function countAcs(acs: { children?: unknown[] }[]): number {
  let n = 0;
  const walk = (list: { children?: unknown[] }[]): void => {
    for (const ac of list) {
      n++;
      if (Array.isArray(ac.children)) walk(ac.children as { children?: unknown[] }[]);
    }
  };
  walk(acs);
  return n;
}

function main(): void {
  const args = parseArgs();
  const cwd = getString(args, 'cwd') ?? process.cwd();
  const root = resolve(cwd);

  ensureClarifyDir(root);
  const state = loadState(root);
  if (!state.scan) throw new Error('No state.scan found. Run `clarify scan` then `clarify ingest`.');

  const envelope = readDraftEnvelope(root);
  const answers = readAnswers(args, root);

  const persona = readFileSync(PERSONA_PATH, 'utf8');

  const answeredQuestions = answers.filter((a) => !a.deferred);
  const deferredQuestions = answers.filter((a) => a.deferred).map((a) => a.question);

  const sections = [
    '# Inputs',
    '',
    `## Ticket reference\n${envelope.ticket_ref}`,
    '',
    '## Ticket content',
    '```',
    envelope.ticket_text,
    '```',
    '',
    '## Codebase scan summary',
    '```markdown',
    state.scan.summary,
    '```',
    '',
    `## Tech stack (one-liner)\n${state.scan.tech_stack}`,
    '',
    '## Phase 1 draft seed',
    '```json',
    JSON.stringify(envelope.draft.draft_seed, null, 2),
    '```',
    '',
    '## Gap answers from the user',
    answeredQuestions.length > 0
      ? answeredQuestions
          .map((a) => `- **${a.field}**: ${a.question}\n  → ${a.answer}`)
          .join('\n')
      : '(no answered gaps)',
    '',
    `## Today (UTC ISO)\n${new Date().toISOString()}`,
    '',
    '# Output contract',
    '',
    'Phase 2 (MODE=finalize): return ONLY the final seed JSON object — no wrapper, no `gaps` field. Apply the user\'s answers to the relevant fields. Populate `brownfield.unresolved_gaps` with the verbatim text of any gap the user explicitly deferred or marked decide-later (none if all answered).',
  ];

  const prompt = [persona, '', '# MODE\nfinalize', '', ...sections].join('\n');
  const raw = oneShotJson<unknown>(prompt, { timeoutMs: 5 * 60 * 1000 });
  const seed = SeedSchema.parse(raw);

  // Force lineage; never trust the LLM with provenance.
  seed.lineage = {
    source: 'ingest',
    interview_transcript: null,
    parent_seed: null,
    ticket_ref: envelope.ticket_ref,
  };

  // Make sure brownfield exists and unresolved_gaps captures the deferrals
  // even if the LLM omitted them.
  if (!seed.brownfield) {
    seed.brownfield = {
      project_type: 'brownfield',
      tech_stack: state.scan.tech_stack,
      context_references: [],
      existing_patterns: [],
      existing_dependencies: [],
      forbidden_new_dependencies: false,
      unresolved_gaps: [],
    };
  }
  // Merge: union of LLM-emitted and explicit deferrals.
  const merged = new Set<string>([
    ...(seed.brownfield.unresolved_gaps ?? []),
    ...deferredQuestions,
  ]);
  seed.brownfield.unresolved_gaps = Array.from(merged);

  const out = seedPath(root);
  writeSeedYaml(out, seed);

  state.seed_id = seed.id;
  state.phase = 'executing';
  saveState(state, root);
  clearDraftEnvelope(root);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        phase: 'finalized',
        seed_id: seed.id,
        seed_path: out,
        ticket_ref: envelope.ticket_ref,
        ac_count: countAcs(seed.acceptance_criteria),
        unresolved_gaps: seed.brownfield.unresolved_gaps,
        answered: answeredQuestions.length,
        deferred: deferredQuestions.length,
      },
      null,
      2,
    ) + '\n',
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`ingest-finalize error: ${(err as Error).message}\n`);
  process.exit(1);
}
