import { describe, it, expect } from 'vitest';
import {
  walkLeaves,
  walkAll,
  findAC,
  effectivePaths,
  rollUpStatus,
  matchesGlob,
  pathCoveredByAnyAC,
} from '../../src/lib/ac.js';
import type { AC } from '../../src/schema/seed.js';

const tree: AC[] = [
  {
    id: 'AC-1',
    title: 'Top',
    allowed_paths: [],
    children: [
      { id: 'AC-1.1', title: 'leaf a', allowed_paths: ['src/a.ts'] },
      { id: 'AC-1.2', title: 'leaf b', allowed_paths: ['src/b/**'] },
    ],
  },
  { id: 'AC-2', title: 'standalone', allowed_paths: ['lib/**'] },
];

describe('ac tree helpers', () => {
  it('walkLeaves yields only leaves', () => {
    expect(walkLeaves(tree).map((a) => a.id)).toEqual(['AC-1.1', 'AC-1.2', 'AC-2']);
  });

  it('walkAll yields all', () => {
    expect(walkAll(tree).map((a) => a.id)).toEqual(['AC-1', 'AC-1.1', 'AC-1.2', 'AC-2']);
  });

  it('findAC finds by id', () => {
    expect(findAC(tree, 'AC-1.2')?.title).toBe('leaf b');
    expect(findAC(tree, 'AC-9.9.9')).toBeUndefined();
  });

  it('effectivePaths inherits child paths when parent empty', () => {
    const ac1 = findAC(tree, 'AC-1')!;
    expect(effectivePaths(ac1).sort()).toEqual(['src/a.ts', 'src/b/**'].sort());
  });

  it('rollUpStatus marks parent passed only when all children passed', () => {
    const status = rollUpStatus(tree, {
      'AC-1.1': 'passed',
      'AC-1.2': 'passed',
      'AC-2': 'passed',
    });
    expect(status['AC-1']).toBe('passed');
    expect(status['AC-2']).toBe('passed');
  });

  it('rollUpStatus marks parent failed when any child failed', () => {
    const status = rollUpStatus(tree, {
      'AC-1.1': 'passed',
      'AC-1.2': 'failed',
    });
    expect(status['AC-1']).toBe('failed');
  });

  it('rollUpStatus shows in_progress when partially in flight', () => {
    const status = rollUpStatus(tree, {
      'AC-1.1': 'in_progress',
      'AC-1.2': 'pending',
    });
    expect(status['AC-1']).toBe('in_progress');
  });
});

describe('glob matching', () => {
  it('matchesGlob handles ** and *', () => {
    expect(matchesGlob('src/foo/bar.ts', 'src/**')).toBe(true);
    expect(matchesGlob('src/foo/bar.ts', 'src/*')).toBe(false);
    expect(matchesGlob('src/foo.ts', 'src/*')).toBe(true);
    expect(matchesGlob('src/foo/bar.ts', 'src/*.ts')).toBe(false);
    expect(matchesGlob('src/foo.ts', 'src/*.ts')).toBe(true);
  });

  it('matchesGlob is exact for literal paths', () => {
    expect(matchesGlob('src/a.ts', 'src/a.ts')).toBe(true);
    expect(matchesGlob('src/b.ts', 'src/a.ts')).toBe(false);
  });

  it('matchesGlob normalizes ./ prefix', () => {
    expect(matchesGlob('./src/a.ts', 'src/**')).toBe(true);
  });

  it('pathCoveredByAnyAC searches the tree', () => {
    expect(pathCoveredByAnyAC('src/b/deep/x.ts', tree)).toBe(true);
    expect(pathCoveredByAnyAC('lib/util.ts', tree)).toBe(true);
    expect(pathCoveredByAnyAC('weird/elsewhere.ts', tree)).toBe(false);
  });
});
