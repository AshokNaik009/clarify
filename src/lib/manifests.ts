import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const KNOWN_MANIFESTS: readonly string[] = [
  'package.json',
  'pnpm-workspace.yaml',
  'turbo.json',
  'nx.json',
  'tsconfig.json',
  'pyproject.toml',
  'requirements.txt',
  'setup.cfg',
  'setup.py',
  'Pipfile',
  'go.mod',
  'go.sum',
  'Cargo.toml',
  'Cargo.lock',
  'Gemfile',
  'Gemfile.lock',
  'composer.json',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  '.tool-versions',
  '.nvmrc',
  '.python-version',
];

const KNOWN_LOCKFILES: readonly string[] = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'poetry.lock',
  'uv.lock',
  'Pipfile.lock',
  'go.sum',
  'Cargo.lock',
  'Gemfile.lock',
  'composer.lock',
];

export interface ManifestInfo {
  path: string;
  rel: string;
}

export interface DiscoveryResult {
  root: string;
  manifests: ManifestInfo[];
  lockfiles: ManifestInfo[];
  packageManager: string | null;
  isBrownfield: boolean;
}

export function discoverManifests(root: string = process.cwd()): DiscoveryResult {
  const r = resolve(root);
  const manifests: ManifestInfo[] = [];
  const lockfiles: ManifestInfo[] = [];

  for (const name of KNOWN_MANIFESTS) {
    const p = join(r, name);
    if (existsSync(p)) manifests.push({ path: p, rel: name });
  }
  for (const name of KNOWN_LOCKFILES) {
    const p = join(r, name);
    if (existsSync(p)) lockfiles.push({ path: p, rel: name });
  }

  const packageManager = inferPackageManager(r, lockfiles, manifests);
  const isBrownfield = inferBrownfield(r, manifests, lockfiles);

  return { root: r, manifests, lockfiles, packageManager, isBrownfield };
}

export function inferPackageManager(
  root: string,
  lockfiles: ManifestInfo[],
  manifests: ManifestInfo[],
): string | null {
  const has = (rel: string): boolean =>
    lockfiles.some((l) => l.rel === rel) || manifests.some((m) => m.rel === rel);

  if (has('pnpm-lock.yaml') || has('pnpm-workspace.yaml')) return 'pnpm';
  if (has('yarn.lock')) return 'yarn';
  if (has('bun.lockb')) return 'bun';
  if (has('package-lock.json')) return 'npm';

  const pkgJsonPath = manifests.find((m) => m.rel === 'package.json')?.path;
  if (pkgJsonPath) {
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as Record<string, unknown>;
      const pm = pkg.packageManager;
      if (typeof pm === 'string') {
        const head = pm.split('@')[0];
        if (head) return head;
      }
      return 'npm';
    } catch {
      return 'npm';
    }
  }

  if (has('uv.lock')) return 'uv';
  if (has('poetry.lock') || manifests.some((m) => m.rel === 'pyproject.toml')) return 'poetry';
  if (has('Pipfile.lock')) return 'pipenv';
  if (has('Cargo.lock') || manifests.some((m) => m.rel === 'Cargo.toml')) return 'cargo';
  if (manifests.some((m) => m.rel === 'go.mod')) return 'go';
  if (has('Gemfile.lock')) return 'bundler';
  if (has('composer.lock')) return 'composer';
  return null;
}

export function inferBrownfield(
  root: string,
  manifests: ManifestInfo[],
  lockfiles: ManifestInfo[],
): boolean {
  // Heuristic: git history + non-empty src or app dir + at least one manifest or lockfile.
  const hasGit = existsSync(join(root, '.git'));
  if (!hasGit) return false;
  if (manifests.length === 0 && lockfiles.length === 0) return false;

  for (const candidate of ['src', 'app', 'lib', 'pkg', 'cmd', 'internal']) {
    const p = join(root, candidate);
    try {
      if (existsSync(p) && statSync(p).isDirectory()) return true;
    } catch {
      // ignore
    }
  }
  // Fall back to: manifest + lockfile alone (e.g., monorepo root with workspaces but no top-level src/)
  return manifests.length > 0 && lockfiles.length > 0;
}

export function readManifestSnippets(
  manifests: ManifestInfo[],
  byteCap: number = 8 * 1024,
): { rel: string; content: string }[] {
  const out: { rel: string; content: string }[] = [];
  for (const m of manifests) {
    try {
      const content = readFileSync(m.path, 'utf8');
      out.push({
        rel: m.rel,
        content: content.length > byteCap ? content.slice(0, byteCap) + '\n…[truncated]\n' : content,
      });
    } catch {
      // skip unreadable manifest
    }
  }
  return out;
}
