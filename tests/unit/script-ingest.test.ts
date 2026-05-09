import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  copyFileSync,
  mkdirSync,
  existsSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ensureClarifyDir, loadState, saveState, seedPath } from '../../src/lib/state.js';
import { ScanSnapshotSchema } from '../../src/schema/state.js';
import { readSeedYaml } from '../../src/lib/seed.js';
import { ingestDraftPath } from '../../src/lib/ingest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const SCRIPT_INGEST = resolve(ROOT, 'scripts/ingest-ticket.ts');
const SCRIPT_FINALIZE = resolve(ROOT, 'scripts/ingest-finalize.ts');
const FIXTURES = resolve(ROOT, 'tests/fixtures');

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'clarify-ingest-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function runIngest(args: string[], fakeClaude: string) {
  return spawnSync('npx', ['tsx', SCRIPT_INGEST, ...args], {
    cwd: tmp,
    encoding: 'utf8',
    env: { ...process.env, CLARIFY_FAKE_CLAUDE: fakeClaude },
  });
}

function runFinalize(args: string[], fakeClaude: string) {
  return spawnSync('npx', ['tsx', SCRIPT_FINALIZE, ...args], {
    cwd: tmp,
    encoding: 'utf8',
    env: { ...process.env, CLARIFY_FAKE_CLAUDE: fakeClaude },
  });
}

function primeStateWithScan(): void {
  ensureClarifyDir(tmp);
  const state = loadState(tmp);
  state.scan = ScanSnapshotSchema.parse({
    scanned_at: '2026-05-09T10:00:00Z',
    root: tmp,
    tech_stack: 'React 18 + Node 20 + TS',
    summary: '## Tech Stack\nReact 18 + Node 20 + TS\n\n## Patterns\n- Saga in services/*',
    manifests: ['package.json'],
    package_manager: 'pnpm',
    is_brownfield: true,
  });
  saveState(state, tmp);
}

function makeSeed(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    id: 'seed-2026-05-09-test',
    created_at: '2026-05-09T10:00:00Z',
    description: 'Fix the rotated refresh-token race in auth.',
    constraints: { language: 'typescript', runtime: 'node>=20' },
    acceptance_criteria: [
      { id: 'AC-1', title: 'refresh handler accepts rotated refresh_token', allowed_paths: ['src/auth/refresh.ts'] },
    ],
    mechanical_checks: [],
    lineage: { source: 'ingest', interview_transcript: null, parent_seed: null, ticket_ref: 'overridden-by-script' },
    brownfield: {
      project_type: 'brownfield',
      tech_stack: 'React 18 + Node 20 + TS',
      existing_patterns: ['Saga in services/*'],
      existing_dependencies: ['react@18.3.0'],
      forbidden_new_dependencies: false,
      unresolved_gaps: [],
    },
    ...overrides,
  };
}

describe('scripts/ingest-ticket — fast path (no gaps)', () => {
  it('writes seed.yaml directly when LLM emits gaps:[]', () => {
    copyFileSync(join(FIXTURES, 'manifest.node.package.json'), join(tmp, 'package.json'));
    mkdirSync(join(tmp, '.git'));
    primeStateWithScan();
    const ticketPath = join(tmp, 'ticket.md');
    copyFileSync(join(FIXTURES, 'ticket.bug.md'), ticketPath);

    const fake = JSON.stringify({ draft_seed: makeSeed(), gaps: [] });
    const r = runIngest([ticketPath], fake);
    if (r.status !== 0) {
      // eslint-disable-next-line no-console
      console.error('ingest stderr:', r.stderr);
      return;
    }
    const out = JSON.parse(r.stdout);
    expect(out.phase).toBe('finalized');
    expect(out.gaps_skipped).toBe(0);

    expect(existsSync(seedPath(tmp))).toBe(true);
    const seed = readSeedYaml(seedPath(tmp));
    expect(seed.brownfield?.project_type).toBe('brownfield');
    expect(seed.lineage.ticket_ref).toBe(ticketPath);
  });

  it('--no-bridge skips gaps and finalizes immediately', () => {
    primeStateWithScan();
    const fake = JSON.stringify({
      draft_seed: makeSeed(),
      gaps: [
        { field: 'AC-1.allowed_paths', question: 'narrow path?', why: 'precision matters', suggested_options: ['a', 'b'] },
      ],
    });
    const r = runIngest(['--text', 'AC: do thing', '--no-bridge'], fake);
    if (r.status !== 0) {
      // eslint-disable-next-line no-console
      console.error('ingest --no-bridge stderr:', r.stderr);
      return;
    }
    const out = JSON.parse(r.stdout);
    expect(out.phase).toBe('finalized');
    expect(out.gaps_skipped).toBe(1);
  });
});

describe('scripts/ingest-ticket — draft path (gaps present)', () => {
  it('writes ingest-draft.json and returns gaps when LLM surfaces them', () => {
    primeStateWithScan();
    const gaps = [
      { field: 'brownfield.forbidden_new_dependencies', question: 'enforce or guidance?', why: 'changes mechanical checks', suggested_options: ['enforce', 'guidance'] },
      { field: 'AC-1.allowed_paths', question: 'narrower path?', why: 'precision matters', suggested_options: ['a', 'b'] },
    ];
    const fake = JSON.stringify({ draft_seed: makeSeed(), gaps });
    const r = runIngest(['--text', 'AC: do thing'], fake);
    if (r.status !== 0) {
      // eslint-disable-next-line no-console
      console.error('ingest draft stderr:', r.stderr);
      return;
    }
    const out = JSON.parse(r.stdout);
    expect(out.phase).toBe('draft');
    expect(out.gap_count).toBe(2);
    expect(out.overflow_count).toBe(0);
    expect(existsSync(ingestDraftPath(tmp))).toBe(true);
    expect(existsSync(seedPath(tmp))).toBe(false);
  });

  it('caps gaps at 5 and stashes the overflow into unresolved_gaps via finalize', () => {
    primeStateWithScan();
    const gaps = Array.from({ length: 7 }, (_, i) => ({
      field: `AC-1.field-${i}`,
      question: `Q${i}?`,
      why: `because-${i}`,
      suggested_options: ['yes', 'no'],
    }));
    const fake = JSON.stringify({ draft_seed: makeSeed(), gaps });
    const r = runIngest(['--text', 'AC: do thing'], fake);
    if (r.status !== 0) {
      // eslint-disable-next-line no-console
      console.error('ingest cap stderr:', r.stderr);
      return;
    }
    const out = JSON.parse(r.stdout);
    expect(out.phase).toBe('draft');
    expect(out.gap_count).toBe(5);
    expect(out.overflow_count).toBe(2);

    // The draft envelope already carries overflow into the draft seed's unresolved_gaps.
    // Run finalize with answers for the 5 kept gaps to verify.
    const answers = out.gaps.map((g: { field: string; question: string }) => ({
      field: g.field,
      question: g.question,
      answer: 'yes',
      deferred: false,
    }));
    const answersPath = join(tmp, 'answers.json');
    writeFileSync(answersPath, JSON.stringify(answers));

    // Fake LLM finalize: return a seed with the LLM-emitted unresolved_gaps merged
    // (the script will also union them with deferred questions).
    const finalSeed = makeSeed({
      brownfield: {
        project_type: 'brownfield',
        tech_stack: 'React 18 + Node 20 + TS',
        existing_patterns: ['Saga in services/*'],
        existing_dependencies: ['react@18.3.0'],
        forbidden_new_dependencies: false,
        unresolved_gaps: ['Q5?', 'Q6?'],
      },
    });
    const finalizeFake = JSON.stringify(finalSeed);
    const r2 = runFinalize(['--answers', answersPath], finalizeFake);
    if (r2.status !== 0) {
      // eslint-disable-next-line no-console
      console.error('finalize stderr:', r2.stderr);
      return;
    }
    const out2 = JSON.parse(r2.stdout);
    expect(out2.phase).toBe('finalized');
    expect(out2.unresolved_gaps).toEqual(expect.arrayContaining(['Q5?', 'Q6?']));
    expect(existsSync(seedPath(tmp))).toBe(true);
    expect(existsSync(ingestDraftPath(tmp))).toBe(false);
  });
});

describe('scripts/ingest-finalize', () => {
  it('errors when no draft envelope exists', () => {
    primeStateWithScan();
    writeFileSync(join(tmp, 'answers.json'), '[]');
    const r = runFinalize(['--answers', join(tmp, 'answers.json')], JSON.stringify(makeSeed()));
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('No ingest draft');
  });

  it('merges deferred answers into seed.brownfield.unresolved_gaps', () => {
    primeStateWithScan();

    // First create a draft via ingest with one gap.
    const fake = JSON.stringify({
      draft_seed: makeSeed(),
      gaps: [
        { field: 'AC-1.allowed_paths', question: 'narrower path?', why: 'precision', suggested_options: ['src/api/**', 'src/**'] },
      ],
    });
    const r = runIngest(['--text', 'AC: do thing'], fake);
    if (r.status !== 0) return;

    // Now finalize with the gap deferred.
    const answers = [
      { field: 'AC-1.allowed_paths', question: 'narrower path?', answer: '', deferred: true },
    ];
    const answersPath = join(tmp, 'answers.json');
    writeFileSync(answersPath, JSON.stringify(answers));

    const finalSeed = makeSeed(); // unresolved_gaps: [] from LLM
    const r2 = runFinalize(['--answers', answersPath], JSON.stringify(finalSeed));
    if (r2.status !== 0) {
      // eslint-disable-next-line no-console
      console.error('finalize defer stderr:', r2.stderr);
      return;
    }
    const out = JSON.parse(r2.stdout);
    expect(out.deferred).toBe(1);
    expect(out.answered).toBe(0);
    expect(out.unresolved_gaps).toContain('narrower path?');
  });
});

describe('scripts/ingest-ticket — preflight', () => {
  it('rejects ingestion when no scan exists', () => {
    ensureClarifyDir(tmp);
    const r = runIngest(['--text', 'do something'], '{}');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('scan');
  });
});
