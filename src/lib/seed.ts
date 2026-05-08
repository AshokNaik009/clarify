import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import YAML from 'yaml';
import { SeedSchema, type Seed } from '../schema/seed.js';
import { seedPath, evolutionsDir } from './state.js';

export function readSeedYaml(path: string): Seed {
  if (!existsSync(path)) {
    throw new Error(`Seed file not found: ${path}`);
  }
  const raw = readFileSync(path, 'utf8');
  let parsed: unknown;
  try {
    parsed = YAML.parse(raw);
  } catch (err) {
    throw new Error(`Seed YAML parse error at ${path}: ${(err as Error).message}`);
  }
  return SeedSchema.parse(parsed);
}

export function writeSeedYaml(path: string, seed: Seed): void {
  const validated = SeedSchema.parse(seed);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, YAML.stringify(validated, { indent: 2, lineWidth: 100 }), 'utf8');
  renameSync(tmp, path);
}

export function loadSeed(root: string = process.cwd()): Seed {
  return readSeedYaml(seedPath(root));
}

export function saveSeed(seed: Seed, root: string = process.cwd()): void {
  writeSeedYaml(seedPath(root), seed);
}

export function nextEvolutionPath(root: string = process.cwd()): { n: number; path: string } {
  const dir = evolutionsDir(root);
  // Files are <n>.yaml — find max
  let maxN = 0;
  try {
    for (const entry of readdirSync(dir)) {
      const m = entry.match(/^(\d+)\.yaml$/);
      if (m && m[1]) {
        const n = parseInt(m[1], 10);
        if (n > maxN) maxN = n;
      }
    }
  } catch {
    // dir may not exist yet
  }
  const n = maxN + 1;
  return { n, path: join(dir, `${n}.yaml`) };
}
