#!/usr/bin/env -S npx tsx
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { parseArgs, getString } from '../src/lib/args.js';
import { ensureClarifyDir, loadState, saveState } from '../src/lib/state.js';
import { discoverManifests, readManifestSnippets } from '../src/lib/manifests.js';
import { oneShotJson } from '../src/lib/claude.js';
import { ScanSnapshotSchema } from '../src/schema/state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PERSONA_PATH = resolve(__dirname, '..', 'src', 'personas', 'codebase-explorer.md');

const ScanResponseSchema = z.object({
  tech_stack: z.string(),
  summary: z.string(),
});

function main(): void {
  const args = parseArgs();
  const cwd = getString(args, 'cwd') ?? process.cwd();
  const root = resolve(cwd);

  ensureClarifyDir(root);
  const discovery = discoverManifests(root);

  if (discovery.manifests.length === 0) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          empty: true,
          message: 'No manifests detected at project root — treating as greenfield.',
          root,
        },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  const persona = readFileSync(PERSONA_PATH, 'utf8');
  const snippets = readManifestSnippets(discovery.manifests, 6 * 1024);
  const manifestBlock = snippets
    .map((s) => `### ${s.rel}\n\`\`\`\n${s.content}\n\`\`\``)
    .join('\n\n');

  const prompt = [
    persona,
    '',
    '# Inputs',
    '',
    `## Project root\n${root}`,
    '',
    `## Detected manifests\n${discovery.manifests.map((m) => '- ' + m.rel).join('\n')}`,
    '',
    `## Detected lockfiles\n${
      discovery.lockfiles.length > 0
        ? discovery.lockfiles.map((m) => '- ' + m.rel).join('\n')
        : '(none)'
    }`,
    '',
    `## Inferred package manager\n${discovery.packageManager ?? '(unknown)'}`,
    '',
    '## Manifest contents',
    manifestBlock,
    '',
    '# Output contract',
    '',
    'Return ONLY a JSON object with this shape:',
    '```json',
    '{ "tech_stack": "<one-line stack summary>", "summary": "<the full markdown summary, ≤500 words>" }',
    '```',
  ].join('\n');

  const raw = oneShotJson<unknown>(prompt, { timeoutMs: 5 * 60 * 1000 });
  const parsed = ScanResponseSchema.parse(raw);

  const snapshot = ScanSnapshotSchema.parse({
    scanned_at: new Date().toISOString(),
    root,
    tech_stack: parsed.tech_stack,
    summary: parsed.summary,
    manifests: discovery.manifests.map((m) => m.rel),
    package_manager: discovery.packageManager,
    is_brownfield: discovery.isBrownfield,
  });

  const state = loadState(root);
  state.scan = snapshot;
  saveState(state, root);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        root,
        is_brownfield: snapshot.is_brownfield,
        package_manager: snapshot.package_manager,
        tech_stack: snapshot.tech_stack,
        manifests: snapshot.manifests,
      },
      null,
      2,
    ) + '\n',
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`scan-codebase error: ${(err as Error).message}\n`);
  process.exit(1);
}
