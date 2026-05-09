import { describe, it, expect } from 'vitest';
import {
  BrownfieldContextSchema,
  ContextReferenceSchema,
  SeedSchema,
} from '../../src/schema/seed.js';
import { ScanSnapshotSchema, StateSchema } from '../../src/schema/state.js';

const VALID_SEED_BASE = {
  version: 1 as const,
  id: 'seed-2026-05-09-test',
  created_at: '2026-05-09T10:00:00Z',
  description: 'A test seed',
  acceptance_criteria: [
    { id: 'AC-1', title: 'do something', allowed_paths: ['src/**'] },
  ],
  lineage: { source: 'interview' as const },
};

describe('ContextReferenceSchema', () => {
  it('accepts a primary path with summary', () => {
    const ok = ContextReferenceSchema.parse({
      path: 'src/auth/jwt.ts',
      role: 'primary',
      summary: 'JWT verification helpers',
    });
    expect(ok.path).toBe('src/auth/jwt.ts');
  });

  it('rejects an invalid role', () => {
    expect(() =>
      ContextReferenceSchema.parse({ path: 'a.ts', role: 'unknown', summary: '' }),
    ).toThrow();
  });
});

describe('BrownfieldContextSchema', () => {
  it('accepts a fully populated brownfield block', () => {
    const ok = BrownfieldContextSchema.parse({
      project_type: 'brownfield',
      tech_stack: 'React 18 + Node 20 + TS',
      context_references: [
        { path: 'src/auth/jwt.ts', role: 'primary', summary: '' },
      ],
      existing_patterns: ['Saga pattern in services/*'],
      existing_dependencies: ['react@18.3.0'],
      forbidden_new_dependencies: true,
    });
    expect(ok.project_type).toBe('brownfield');
    expect(ok.forbidden_new_dependencies).toBe(true);
  });

  it('defaults sensible empty values', () => {
    const ok = BrownfieldContextSchema.parse({});
    expect(ok.project_type).toBe('greenfield');
    expect(ok.context_references).toEqual([]);
    expect(ok.forbidden_new_dependencies).toBe(false);
  });
});

describe('SeedSchema with brownfield', () => {
  it('parses a greenfield seed (no brownfield field)', () => {
    const seed = SeedSchema.parse(VALID_SEED_BASE);
    expect(seed.brownfield).toBeUndefined();
  });

  it('parses a brownfield seed with ticket_ref lineage', () => {
    const seed = SeedSchema.parse({
      ...VALID_SEED_BASE,
      lineage: {
        source: 'ingest',
        interview_transcript: null,
        parent_seed: null,
        ticket_ref: 'jira-AUTH-1234.md',
      },
      brownfield: {
        project_type: 'brownfield',
        tech_stack: 'React 18',
        existing_patterns: ['Zod-validated DTOs'],
      },
    });
    expect(seed.lineage.ticket_ref).toBe('jira-AUTH-1234.md');
    expect(seed.brownfield?.project_type).toBe('brownfield');
  });
});

describe('ScanSnapshotSchema', () => {
  it('parses a minimal snapshot', () => {
    const ok = ScanSnapshotSchema.parse({
      scanned_at: '2026-05-09T10:00:00Z',
      root: '/tmp/x',
    });
    expect(ok.is_brownfield).toBe(false);
    expect(ok.tech_stack).toBe('');
  });

  it('plugs into StateSchema via state.scan', () => {
    const state = StateSchema.parse({
      schema_version: 1,
      started_at: '2026-05-09T10:00:00Z',
      scan: {
        scanned_at: '2026-05-09T10:00:00Z',
        root: '/tmp/x',
        tech_stack: 'React',
        summary: '## Tech Stack\nReact',
        manifests: ['package.json'],
        package_manager: 'pnpm',
        is_brownfield: true,
      },
    });
    expect(state.scan?.is_brownfield).toBe(true);
  });
});
