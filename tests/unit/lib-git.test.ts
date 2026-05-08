import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { isGitRepo, modifiedFiles } from '../../src/lib/git.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'clarify-git-test-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function git(...args: string[]) {
  return spawnSync('git', args, { cwd: tmp, encoding: 'utf8' });
}

describe('lib/git', () => {
  it('isGitRepo returns false outside a repo', () => {
    expect(isGitRepo({ cwd: tmp })).toBe(false);
  });

  it('isGitRepo returns true and modifiedFiles tracks changes', () => {
    const init = git('init', '-b', 'main');
    if (init.status !== 0) {
      // git not available; skip rather than fail
      return;
    }
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    writeFileSync(join(tmp, 'a.txt'), 'hello\n');
    git('add', '.');
    git('commit', '-m', 'init');

    expect(isGitRepo({ cwd: tmp })).toBe(true);

    mkdirSync(join(tmp, 'src'), { recursive: true });
    writeFileSync(join(tmp, 'src', 'b.ts'), 'export {}\n');
    writeFileSync(join(tmp, 'a.txt'), 'modified\n');

    const files = modifiedFiles(null, { cwd: tmp });
    expect(files).toContain('a.txt');
    expect(files).toContain('src/b.ts');
  });
});
