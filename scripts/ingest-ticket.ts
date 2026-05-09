#!/usr/bin/env -S npx tsx
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, resolve } from 'node:path';
import { parseArgs, getBool, getString } from '../src/lib/args.js';
import { ensureClarifyDir, loadState, saveState, seedPath } from '../src/lib/state.js';
import { writeSeedYaml } from '../src/lib/seed.js';
import { oneShotJson } from '../src/lib/claude.js';
import { SeedSchema } from '../src/schema/seed.js';
import {
  DraftSchema,
  applyGapCap,
  writeDraftEnvelope,
  clearDraftEnvelope,
} from '../src/lib/ingest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PERSONA_PATH = resolve(__dirname, '..', 'src', 'personas', 'seed-architect.md');

function readTicket(args: ReturnType<typeof parseArgs>, cwd: string): { text: string; ref: string } {
  const filePath = getString(args, 'file');
  const inlineText = getString(args, 'text');
  const positional = args._[0];

  if (filePath) {
    const abs = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
    if (!existsSync(abs)) throw new Error(`Ticket file not found: ${abs}`);
    return { text: readFileSync(abs, 'utf8'), ref: abs };
  }
  if (inlineText) {
    return { text: inlineText, ref: 'inline:--text' };
  }
  if (positional) {
    const abs = isAbsolute(positional) ? positional : resolve(cwd, positional);
    if (existsSync(abs)) return { text: readFileSync(abs, 'utf8'), ref: abs };
    return { text: positional, ref: 'inline:positional' };
  }
  throw new Error('Provide a ticket via positional path, --file <path>, or --text "<paste>".');
}

function buildPrompt(persona: string, mode: 'draft' | 'finalize', sections: string[]): string {
  return [persona, '', `# MODE\n${mode}`, '', ...sections].join('\n');
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
  const noBridge = getBool(args, 'no-bridge');
  const root = resolve(cwd);

  ensureClarifyDir(root);
  const state = loadState(root);

  if (!state.scan) {
    throw new Error(
      'No codebase scan found. Run `clarify scan` first so the seed can reference real paths.',
    );
  }

  const ticket = readTicket(args, root);
  const persona = readFileSync(PERSONA_PATH, 'utf8');

  const sections = [
    '# Inputs',
    '',
    `## Ticket reference\n${ticket.ref}`,
    '',
    '## Ticket content',
    '```',
    ticket.text,
    '```',
    '',
    '## Codebase scan summary',
    '```markdown',
    state.scan.summary,
    '```',
    '',
    `## Tech stack (one-liner)\n${state.scan.tech_stack}`,
    '',
    `## Project root\n${root}`,
    '',
    `## Today (UTC ISO)\n${new Date().toISOString()}`,
    '',
    '# Output contract',
    '',
    'Phase 1 (MODE=draft): return `{ "draft_seed": {...}, "gaps": [...] }`. The gaps array MUST have ≤5 entries. Each gap is `{field, question, why, suggested_options}`. Use `gaps: []` if the ticket is fully unambiguous.',
  ];

  const prompt = buildPrompt(persona, 'draft', sections);
  const raw = oneShotJson<unknown>(prompt, { timeoutMs: 5 * 60 * 1000 });
  const draft = DraftSchema.parse(raw);

  const { kept, overflowQuestions } = applyGapCap(draft.gaps);

  // Force lineage on the draft regardless of what the LLM produced.
  draft.draft_seed.lineage = {
    source: 'ingest',
    interview_transcript: null,
    parent_seed: null,
    ticket_ref: ticket.ref,
  };

  // Belt-and-braces: if the LLM forgot brownfield, attach a minimal default.
  if (!draft.draft_seed.brownfield) {
    draft.draft_seed.brownfield = {
      project_type: 'brownfield',
      tech_stack: state.scan.tech_stack,
      context_references: [],
      existing_patterns: [],
      existing_dependencies: [],
      forbidden_new_dependencies: false,
      unresolved_gaps: [],
    };
  }

  // Stash overflow questions into unresolved_gaps so they reach the LLM-review
  // prompt later.
  if (overflowQuestions.length > 0) {
    draft.draft_seed.brownfield.unresolved_gaps = [
      ...draft.draft_seed.brownfield.unresolved_gaps,
      ...overflowQuestions,
    ];
  }

  // --no-bridge OR no gaps → skip phase 2 and write seed immediately.
  if (noBridge || kept.length === 0) {
    const seed = SeedSchema.parse(draft.draft_seed);
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
          ticket_ref: ticket.ref,
          ac_count: countAcs(seed.acceptance_criteria),
          gaps_skipped: noBridge ? draft.gaps.length : 0,
          unresolved_gaps: seed.brownfield?.unresolved_gaps ?? [],
        },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  // Gaps present → write the draft envelope and emit gaps for the SKILL to
  // route through AskUserQuestion.
  const draftEnvelope = {
    ticket_ref: ticket.ref,
    ticket_text: ticket.text,
    draft: { ...draft, gaps: kept },
  };
  const draftPath = writeDraftEnvelope(root, draftEnvelope);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        phase: 'draft',
        draft_path: draftPath,
        ticket_ref: ticket.ref,
        gap_count: kept.length,
        overflow_count: overflowQuestions.length,
        gaps: kept,
        next_step: 'Resolve gaps with the user, then run `clarify ingest --finalize --answers <json>`.',
      },
      null,
      2,
    ) + '\n',
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`ingest-ticket error: ${(err as Error).message}\n`);
  process.exit(1);
}
