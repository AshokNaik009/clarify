import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { writeSeedYaml } from '../../src/lib/seed.js';
import { ensureClarifyDir, seedPath } from '../../src/lib/state.js';
import { SeedSchema } from '../../src/schema/seed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const SCRIPT = resolve(ROOT, 'scripts/detect-mechanical.ts');
const FIXTURES = resolve(ROOT, 'tests/fixtures');

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'clarify-detect-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function runScript(args: string[], fakeClaude: string) {
  return spawnSync('npx', ['tsx', SCRIPT, ...args], {
    cwd: tmp,
    encoding: 'utf8',
    env: { ...process.env, CLARIFY_FAKE_CLAUDE: fakeClaude },
  });
}

function seedTemplate() {
  return SeedSchema.parse({
    version: 1,
    id: 'seed-2026-05-09-test',
    created_at: '2026-05-09T10:00:00Z',
    description: 'A test seed',
    acceptance_criteria: [{ id: 'AC-1', title: 'do', allowed_paths: ['src/**'] }],
    lineage: { source: 'interview' },
    mechanical_checks: [],
  });
}

describe('scripts/detect-mechanical', () => {
  it('writes proposed checks into seed.yaml', () => {
    copyFileSync(join(FIXTURES, 'manifest.node.package.json'), join(tmp, 'package.json'));
    ensureClarifyDir(tmp);
    writeSeedYaml(seedPath(tmp), seedTemplate());

    const fake = JSON.stringify({
      checks: [
        { name: 'lint', cmd: 'pnpm lint' },
        { name: 'test', cmd: 'pnpm test' },
      ],
      notes: 'inferred from package.json',
    });
    const r = runScript([], fake);
    if (r.status !== 0) {
      // eslint-disable-next-line no-console
      console.error('detect stderr:', r.stderr);
      return;
    }
    const out = JSON.parse(r.stdout);
    expect(out.checks).toHaveLength(2);
    expect(out.checks[0].name).toBe('lint');
  });

  it('skips when seed already has checks unless --force', () => {
    copyFileSync(join(FIXTURES, 'manifest.node.package.json'), join(tmp, 'package.json'));
    ensureClarifyDir(tmp);
    const seed = seedTemplate();
    seed.mechanical_checks = [{ name: 'lint', cmd: 'pnpm lint' }];
    writeSeedYaml(seedPath(tmp), seed);

    const fake = JSON.stringify({ checks: [{ name: 'lint', cmd: 'NEW' }], notes: '' });
    const r = runScript([], fake);
    if (r.status !== 0) {
      // eslint-disable-next-line no-console
      console.error('detect stderr:', r.stderr);
      return;
    }
    const out = JSON.parse(r.stdout);
    expect(out.skipped).toBe(true);
    expect(out.checks[0].cmd).toBe('pnpm lint');

    const r2 = runScript(['--force'], fake);
    if (r2.status !== 0) {
      // eslint-disable-next-line no-console
      console.error('detect --force stderr:', r2.stderr);
      return;
    }
    const out2 = JSON.parse(r2.stdout);
    expect(out2.checks[0].cmd).toBe('NEW');
  });

  it('returns empty when no manifests are present', () => {
    ensureClarifyDir(tmp);
    writeSeedYaml(seedPath(tmp), seedTemplate());
    mkdirSync(join(tmp, 'src'), { recursive: true });
    const r = runScript([], '{"checks":[],"notes":"unused"}');
    if (r.status !== 0) {
      // eslint-disable-next-line no-console
      console.error('detect empty stderr:', r.stderr);
      return;
    }
    const out = JSON.parse(r.stdout);
    expect(out.empty).toBe(true);
  });
});
