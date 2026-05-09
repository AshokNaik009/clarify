#!/usr/bin/env -S npx tsx
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { parseArgs, getBool, getString } from '../src/lib/args.js';
import { loadSeed, saveSeed } from '../src/lib/seed.js';
import { discoverManifests, readManifestSnippets } from '../src/lib/manifests.js';
import { oneShotJson } from '../src/lib/claude.js';
import { seedPath } from '../src/lib/state.js';
import { MechanicalCheckSchema } from '../src/schema/seed.js';

const ResponseSchema = z.object({
  checks: z.array(MechanicalCheckSchema).default([]),
  notes: z.string().default(''),
});

function main(): void {
  const args = parseArgs();
  const cwd = getString(args, 'cwd') ?? process.cwd();
  const force = getBool(args, 'force');
  const root = resolve(cwd);

  if (!existsSync(seedPath(root))) {
    throw new Error(
      `No seed found at ${seedPath(root)}. Run \`clarify ingest\` or \`clarify interview\` first.`,
    );
  }

  const seed = loadSeed(root);

  if (seed.mechanical_checks.length > 0 && !force) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'mechanical_checks already present (use --force to overwrite)',
          checks: seed.mechanical_checks,
        },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  const discovery = discoverManifests(root);
  if (discovery.manifests.length === 0) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          empty: true,
          message: 'No manifests detected — leave mechanical_checks empty or fill manually.',
        },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  const snippets = readManifestSnippets(discovery.manifests, 6 * 1024);
  const manifestBlock = snippets
    .map((s) => `### ${s.rel}\n\`\`\`\n${s.content}\n\`\`\``)
    .join('\n\n');

  const prompt = [
    'You author the deterministic Stage 1 commands for the `clarify` evaluation pipeline.',
    '',
    'Given the project manifests below, propose the exact shell commands to run for: lint, typecheck, test, build (in that order of priority). Skip any check the project does not support.',
    '',
    'Rules:',
    '- Use the project\'s actual package manager (e.g. `pnpm`, `npm`, `uv`, `cargo`, `go`).',
    '- Each command must be safe to run repeatedly with no side effects on user data.',
    '- Each command must exit non-zero on failure.',
    '- Do NOT propose `npm install` or other commands that mutate the lockfile.',
    '- If the manifests reveal a workspace tool (turbo, nx, pnpm), prefer the workspace-aware form.',
    '- Each entry must have a short `name` (one of: `lint`, `typecheck`, `test`, `build`, or `<name>:<scope>`) and a single shell `cmd`.',
    '',
    `# Inputs`,
    '',
    `## Project root\n${root}`,
    '',
    `## Inferred package manager\n${discovery.packageManager ?? '(unknown)'}`,
    '',
    '## Manifest contents',
    manifestBlock,
    '',
    '# Output contract',
    '',
    'Return ONLY a JSON object:',
    '```json',
    '{',
    '  "checks": [',
    '    { "name": "lint", "cmd": "pnpm lint" },',
    '    { "name": "typecheck", "cmd": "pnpm typecheck" }',
    '  ],',
    '  "notes": "<≤200 chars on what was/wasn\'t inferred>"',
    '}',
    '```',
    '',
    'If you cannot propose any verifiable commands, return `{ "checks": [], "notes": "<reason>" }`.',
  ].join('\n');

  const raw = oneShotJson<unknown>(prompt, { timeoutMs: 3 * 60 * 1000 });
  const parsed = ResponseSchema.parse(raw);

  seed.mechanical_checks = parsed.checks;
  saveSeed(seed, root);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        seed_path: seedPath(root),
        checks: parsed.checks,
        notes: parsed.notes,
      },
      null,
      2,
    ) + '\n',
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`detect-mechanical error: ${(err as Error).message}\n`);
  process.exit(1);
}
