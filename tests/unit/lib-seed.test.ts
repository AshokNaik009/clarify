import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSeedYaml, writeSeedYaml, nextEvolutionPath } from '../../src/lib/seed.js';
import { ensureClarifyDir, seedPath } from '../../src/lib/state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, '../fixtures/seed.todo.yaml');

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'clarify-seed-test-'));
  ensureClarifyDir(tmp);
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('lib/seed', () => {
  it('readSeedYaml parses fixture', () => {
    const seed = readSeedYaml(FIXTURE);
    expect(seed.id).toBe('seed-2026-05-08-todo-app');
  });

  it('writeSeedYaml + readSeedYaml roundtrips', () => {
    const seed = readSeedYaml(FIXTURE);
    const out = join(tmp, '.clarify', 'seed.yaml');
    writeSeedYaml(out, seed);
    expect(existsSync(out)).toBe(true);
    const seed2 = readSeedYaml(out);
    expect(seed2.id).toBe(seed.id);
    expect(seed2.acceptance_criteria.length).toBe(seed.acceptance_criteria.length);
  });

  it('nextEvolutionPath increments past existing evolutions', () => {
    const dir = join(tmp, '.clarify', 'evolutions');
    mkdirSync(dir, { recursive: true });
    // Place a fake 1.yaml & 3.yaml; next should be 4
    const seed = readSeedYaml(FIXTURE);
    writeSeedYaml(join(dir, '1.yaml'), seed);
    writeSeedYaml(join(dir, '3.yaml'), seed);
    const r = nextEvolutionPath(tmp);
    expect(r.n).toBe(4);
    expect(r.path.endsWith('4.yaml')).toBe(true);
  });

  it('readSeedYaml throws on missing file', () => {
    expect(() => readSeedYaml(join(tmp, 'nope.yaml'))).toThrow();
  });
});
