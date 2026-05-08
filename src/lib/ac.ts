import type { AC } from '../schema/seed.js';
import type { ACStatus } from '../schema/state.js';

export function walkAll(tree: AC[]): AC[] {
  const out: AC[] = [];
  const visit = (nodes: AC[]) => {
    for (const n of nodes) {
      out.push(n);
      if (n.children && n.children.length > 0) visit(n.children);
    }
  };
  visit(tree);
  return out;
}

export function walkLeaves(tree: AC[]): AC[] {
  const out: AC[] = [];
  const visit = (nodes: AC[]) => {
    for (const n of nodes) {
      if (!n.children || n.children.length === 0) out.push(n);
      else visit(n.children);
    }
  };
  visit(tree);
  return out;
}

export function findAC(tree: AC[], id: string): AC | undefined {
  for (const n of walkAll(tree)) {
    if (n.id === id) return n;
  }
  return undefined;
}

export function effectivePaths(ac: AC): string[] {
  if (!ac.children || ac.children.length === 0) return ac.allowed_paths ?? [];
  if (ac.allowed_paths && ac.allowed_paths.length > 0) return ac.allowed_paths;
  const acc = new Set<string>();
  for (const child of ac.children) {
    for (const p of effectivePaths(child)) acc.add(p);
  }
  return Array.from(acc);
}

export function rollUpStatus(
  tree: AC[],
  status: Record<string, ACStatus>,
): Record<string, ACStatus> {
  const next: Record<string, ACStatus> = { ...status };

  const compute = (ac: AC): ACStatus => {
    if (!ac.children || ac.children.length === 0) {
      return next[ac.id] ?? 'pending';
    }
    const childStatuses = ac.children.map(compute);
    if (childStatuses.some((s) => s === 'failed')) return 'failed';
    if (childStatuses.every((s) => s === 'passed')) return 'passed';
    if (childStatuses.some((s) => s === 'in_progress')) return 'in_progress';
    if (childStatuses.every((s) => s === 'skipped')) return 'skipped';
    return 'pending';
  };

  for (const root of tree) {
    next[root.id] = compute(root);
    for (const node of walkAll([root])) {
      if (node.children && node.children.length > 0) {
        next[node.id] = compute(node);
      } else {
        next[node.id] = next[node.id] ?? 'pending';
      }
    }
  }
  return next;
}

/**
 * Glob-ish match. Supports `**` (any), `*` (segment), and literal paths.
 * Repo-relative; both pattern and path are normalized to forward slashes.
 */
export function matchesGlob(path: string, pattern: string): boolean {
  const norm = (s: string) => s.replace(/\\/g, '/').replace(/^\.\//, '');
  const p = norm(path);
  const g = norm(pattern);
  const re = globToRegExp(g);
  return re.test(p);
}

export function globToRegExp(pattern: string): RegExp {
  let re = '^';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    const next = pattern[i + 1];
    if (c === '*' && next === '*') {
      // ** matches across slashes
      re += '.*';
      i++;
      // swallow trailing /
      if (pattern[i + 1] === '/') i++;
    } else if (c === '*') {
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else if (c && /[.+^${}()|[\]\\]/.test(c)) {
      re += '\\' + c;
    } else if (c !== undefined) {
      re += c;
    }
  }
  re += '$';
  return new RegExp(re);
}

export function pathCoveredByAnyAC(path: string, tree: AC[]): boolean {
  for (const ac of walkAll(tree)) {
    for (const pattern of effectivePaths(ac)) {
      if (matchesGlob(path, pattern)) return true;
    }
  }
  return false;
}

export function pathCoveredByAC(path: string, ac: AC): boolean {
  for (const pattern of effectivePaths(ac)) {
    if (matchesGlob(path, pattern)) return true;
  }
  return false;
}
