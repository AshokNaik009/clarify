import { spawnSync } from 'node:child_process';

export interface GitOptions {
  cwd?: string;
}

export function isGitRepo(opts: GitOptions = {}): boolean {
  const r = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: opts.cwd ?? process.cwd(),
    encoding: 'utf8',
  });
  return r.status === 0 && r.stdout.trim() === 'true';
}

/**
 * Modified files since `since` (defaults to HEAD~1, falls back to staged+unstaged).
 * Returns repo-relative paths. If git is unavailable, returns [].
 */
export function modifiedFiles(since: string | null = 'HEAD~1', opts: GitOptions = {}): string[] {
  const cwd = opts.cwd ?? process.cwd();
  if (!isGitRepo({ cwd })) return [];

  if (since) {
    const r = spawnSync('git', ['diff', '--name-only', since], {
      cwd,
      encoding: 'utf8',
    });
    if (r.status === 0) return parseFileList(r.stdout);
    // fall through to working-tree diff if since is invalid (e.g. shallow clone, first commit)
  }

  const staged = spawnSync('git', ['diff', '--name-only', '--cached'], { cwd, encoding: 'utf8' });
  const unstaged = spawnSync('git', ['diff', '--name-only'], { cwd, encoding: 'utf8' });
  const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd,
    encoding: 'utf8',
  });
  const set = new Set<string>([
    ...parseFileList(staged.stdout),
    ...parseFileList(unstaged.stdout),
    ...parseFileList(untracked.stdout),
  ]);
  return Array.from(set);
}

export function diffForPaths(paths: string[], opts: GitOptions = {}): string {
  const cwd = opts.cwd ?? process.cwd();
  if (!isGitRepo({ cwd }) || paths.length === 0) return '';
  const r = spawnSync('git', ['diff', 'HEAD', '--', ...paths], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.status !== 0) return '';
  return r.stdout;
}

function parseFileList(stdout: string | undefined): string[] {
  if (!stdout) return [];
  return stdout
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
