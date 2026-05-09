import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  discoverManifests,
  inferPackageManager,
  inferBrownfield,
  readManifestSnippets,
} from '../../src/lib/manifests.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, '..', 'fixtures');

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'clarify-manifests-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('discoverManifests', () => {
  it('finds package.json + lockfile + workspace yaml in a Node repo and infers pnpm', () => {
    copyFileSync(join(FIXTURES, 'manifest.node.package.json'), join(tmp, 'package.json'));
    writeFileSync(join(tmp, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
    writeFileSync(join(tmp, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');

    const result = discoverManifests(tmp);
    const rels = result.manifests.map((m) => m.rel).sort();
    expect(rels).toContain('package.json');
    expect(rels).toContain('pnpm-workspace.yaml');
    expect(result.lockfiles.map((l) => l.rel)).toContain('pnpm-lock.yaml');
    expect(result.packageManager).toBe('pnpm');
  });

  it('finds pyproject.toml and infers poetry/uv', () => {
    copyFileSync(join(FIXTURES, 'manifest.python.pyproject.toml'), join(tmp, 'pyproject.toml'));
    writeFileSync(join(tmp, 'uv.lock'), '');

    const result = discoverManifests(tmp);
    expect(result.manifests.map((m) => m.rel)).toContain('pyproject.toml');
    expect(result.packageManager).toBe('uv');
  });

  it('returns empty manifests in a bare directory', () => {
    const result = discoverManifests(tmp);
    expect(result.manifests).toHaveLength(0);
    expect(result.packageManager).toBeNull();
  });
});

describe('inferPackageManager', () => {
  it('reads packageManager from package.json when no lockfile present', () => {
    copyFileSync(join(FIXTURES, 'manifest.node.package.json'), join(tmp, 'package.json'));
    const result = discoverManifests(tmp);
    expect(inferPackageManager(tmp, result.lockfiles, result.manifests)).toBe('pnpm');
  });

  it('falls back to npm if package.json has no packageManager and no lockfile', () => {
    writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'plain', version: '0.0.1' }));
    const result = discoverManifests(tmp);
    expect(inferPackageManager(tmp, result.lockfiles, result.manifests)).toBe('npm');
  });
});

describe('inferBrownfield', () => {
  it('returns false in a directory with no .git', () => {
    copyFileSync(join(FIXTURES, 'manifest.node.package.json'), join(tmp, 'package.json'));
    mkdirSync(join(tmp, 'src'));
    const result = discoverManifests(tmp);
    expect(inferBrownfield(tmp, result.manifests, result.lockfiles)).toBe(false);
  });

  it('returns true with .git + manifest + src/', () => {
    copyFileSync(join(FIXTURES, 'manifest.node.package.json'), join(tmp, 'package.json'));
    mkdirSync(join(tmp, '.git'));
    mkdirSync(join(tmp, 'src'));
    const result = discoverManifests(tmp);
    expect(inferBrownfield(tmp, result.manifests, result.lockfiles)).toBe(true);
  });

  it('returns false with .git but no manifest', () => {
    mkdirSync(join(tmp, '.git'));
    mkdirSync(join(tmp, 'src'));
    const result = discoverManifests(tmp);
    expect(inferBrownfield(tmp, result.manifests, result.lockfiles)).toBe(false);
  });
});

describe('readManifestSnippets', () => {
  it('reads manifest contents and truncates over the byte cap', () => {
    writeFileSync(join(tmp, 'package.json'), 'A'.repeat(20_000));
    const result = discoverManifests(tmp);
    const snippets = readManifestSnippets(result.manifests, 1024);
    expect(snippets[0]?.rel).toBe('package.json');
    expect(snippets[0]?.content.length).toBeLessThan(20_000);
    expect(snippets[0]?.content).toContain('truncated');
  });
});
