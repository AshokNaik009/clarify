import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { StateSchema, type State } from '../schema/state.js';

export const CLARIFY_DIR = '.clarify';
export const STATE_FILE = 'state.json';
export const SEED_FILE = 'seed.yaml';
export const TRANSCRIPTS_DIR = 'transcripts';
export const EVOLUTIONS_DIR = 'evolutions';

export function clarifyDir(root: string = process.cwd()): string {
  return resolve(root, CLARIFY_DIR);
}

export function statePath(root: string = process.cwd()): string {
  return join(clarifyDir(root), STATE_FILE);
}

export function seedPath(root: string = process.cwd()): string {
  return join(clarifyDir(root), SEED_FILE);
}

export function ensureClarifyDir(root: string = process.cwd()): string {
  const dir = clarifyDir(root);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, TRANSCRIPTS_DIR), { recursive: true });
  mkdirSync(join(dir, EVOLUTIONS_DIR), { recursive: true });
  return dir;
}

export function emptyState(): State {
  return StateSchema.parse({
    schema_version: 1,
    started_at: new Date().toISOString(),
  });
}

export function loadState(root: string = process.cwd()): State {
  const path = statePath(root);
  if (!existsSync(path)) return emptyState();
  const raw = readFileSync(path, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`state.json is not valid JSON at ${path}: ${(err as Error).message}`);
  }
  return StateSchema.parse(parsed);
}

export function saveState(state: State, root: string = process.cwd()): void {
  const validated = StateSchema.parse(state);
  ensureClarifyDir(root);
  const path = statePath(root);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(validated, null, 2) + '\n', 'utf8');
  renameSync(tmp, path);
}

export function updateState(
  mutator: (s: State) => State | void,
  root: string = process.cwd(),
): State {
  const current = loadState(root);
  const next = mutator(current) ?? current;
  saveState(next, root);
  return next;
}

export function transcriptsDir(root: string = process.cwd()): string {
  const dir = join(clarifyDir(root), TRANSCRIPTS_DIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function evolutionsDir(root: string = process.cwd()): string {
  const dir = join(clarifyDir(root), EVOLUTIONS_DIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function ensureParent(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}
