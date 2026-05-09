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

/**
 * Recent git log entries for a set of paths (`--oneline -- <paths>`). Used
 * by the brownfield LLM-review prompt so the reviewer sees recent history.
 * Returns one log line per entry (empty string if not a git repo or no history).
 */
export function recentLogForPaths(
  paths: string[],
  limit: number = 5,
  opts: GitOptions = {},
): string {
  const cwd = opts.cwd ?? process.cwd();
  if (!isGitRepo({ cwd })) return '';
  const args = ['log', `-n`, String(limit), '--oneline'];
  if (paths.length > 0) args.push('--', ...paths);
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (r.status !== 0) return '';
  return r.stdout.trim();
}

function parseFileList(stdout: string | undefined): string[] {
  if (!stdout) return [];
  return stdout
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
