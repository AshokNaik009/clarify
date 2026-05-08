import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { SeedSchema } from '../../src/schema/seed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, '../fixtures/seed.todo.yaml');

describe('SeedSchema', () => {
  it('accepts the todo fixture and applies thresholds defaults', () => {
    const raw = YAML.parse(readFileSync(FIXTURE, 'utf8'));
    const seed = SeedSchema.parse(raw);
    expect(seed.id).toBe('seed-2026-05-08-todo-app');
    expect(seed.backend).toBe('claude');
    expect(seed.thresholds.ambiguity_max).toBe(0.2);
    expect(seed.thresholds.max_evolutions).toBe(3);
    expect(seed.acceptance_criteria.length).toBe(2);
  });

  it('rejects malformed AC ids', () => {
    expect(() =>
      SeedSchema.parse({
        version: 1,
        id: 'seed-x',
        created_at: '2026-05-08T10:30:00Z',
        description: 'nope',
        acceptance_criteria: [
          { id: 'BAD-1', title: 'x', allowed_paths: ['*'] },
        ],
        lineage: { source: 'interview' },
      }),
    ).toThrow();
  });

  it('requires version literal 1', () => {
    expect(() =>
      SeedSchema.parse({
        version: 2,
        id: 'seed-x',
        created_at: '2026-05-08T10:30:00Z',
        description: 'nope',
        acceptance_criteria: [{ id: 'AC-1', title: 'x', allowed_paths: ['*'] }],
        lineage: { source: 'interview' },
      }),
    ).toThrow();
  });

  it('parses nested ACs recursively', () => {
    const raw = YAML.parse(readFileSync(FIXTURE, 'utf8'));
    const seed = SeedSchema.parse(raw);
    const ac1 = seed.acceptance_criteria[0]!;
    expect(ac1.children?.length).toBe(2);
    expect(ac1.children?.[0]?.id).toBe('AC-1.1');
  });
});
