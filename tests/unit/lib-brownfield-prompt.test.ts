import { describe, it, expect } from 'vitest';
import { buildBrownfieldBlock } from '../../src/lib/brownfield-prompt.js';
import { SeedSchema, type Seed } from '../../src/schema/seed.js';

function seedWith(overrides: Partial<Seed>): Seed {
  return SeedSchema.parse({
    version: 1,
    id: 'seed-2026-05-09-test',
    created_at: '2026-05-09T10:00:00Z',
    description: 'A test seed',
    acceptance_criteria: [
      { id: 'AC-1', title: 'do thing', allowed_paths: ['src/**'] },
    ],
    lineage: { source: 'interview' },
    ...overrides,
  });
}

describe('buildBrownfieldBlock', () => {
  it('returns empty string for greenfield seeds', () => {
    const seed = seedWith({});
    expect(buildBrownfieldBlock(seed, 'irrelevant log')).toBe('');
  });

  it('returns empty string when brownfield.project_type is greenfield', () => {
    const seed = seedWith({
      brownfield: {
        project_type: 'greenfield',
        tech_stack: '',
        context_references: [],
        existing_patterns: [],
        existing_dependencies: [],
        forbidden_new_dependencies: false,
        unresolved_gaps: [],
      },
    });
    expect(buildBrownfieldBlock(seed)).toBe('');
  });

  it('renders tech stack, patterns, and forbidden-new-deps', () => {
    const seed = seedWith({
      brownfield: {
        project_type: 'brownfield',
        tech_stack: 'React 18 + Node 20',
        context_references: [],
        existing_patterns: ['Saga in services/*', 'Zod DTOs'],
        existing_dependencies: ['react@18.3.0'],
        forbidden_new_dependencies: true,
        unresolved_gaps: [],
      },
    });
    const block = buildBrownfieldBlock(seed, '');
    expect(block).toContain('Brownfield context');
    expect(block).toContain('React 18 + Node 20');
    expect(block).toContain('Saga in services/*');
    expect(block).toContain('react@18.3.0');
    expect(block).toContain('No new dependencies');
  });

  it('includes unresolved_gaps when present', () => {
    const seed = seedWith({
      brownfield: {
        project_type: 'brownfield',
        tech_stack: 'TS',
        context_references: [],
        existing_patterns: [],
        existing_dependencies: [],
        forbidden_new_dependencies: false,
        unresolved_gaps: ['enforce no-new-deps?', 'narrower path?'],
      },
    });
    const block = buildBrownfieldBlock(seed);
    expect(block).toContain('Unresolved gaps');
    expect(block).toContain('enforce no-new-deps?');
    expect(block).toContain('narrower path?');
  });

  it('includes the recent git log when provided', () => {
    const seed = seedWith({
      brownfield: {
        project_type: 'brownfield',
        tech_stack: 'TS',
        context_references: [],
        existing_patterns: [],
        existing_dependencies: [],
        forbidden_new_dependencies: false,
        unresolved_gaps: [],
      },
    });
    const block = buildBrownfieldBlock(seed, 'abc123 fix: x\ndef456 feat: y');
    expect(block).toContain('abc123 fix: x');
    expect(block).toContain('def456 feat: y');
  });
});
