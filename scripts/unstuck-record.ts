#!/usr/bin/env -S npx tsx
import { parseArgs, getString, getBool } from '../src/lib/args.js';
import { loadState, saveState } from '../src/lib/state.js';
import {
  PersonaNameSchema,
  UnstuckEntrySchema,
  UnstuckTriggerSchema,
} from '../src/schema/state.js';
import {
  pickPersonaForFailure,
  isPersonaName,
  type FailureCategory,
} from '../src/lib/personas.js';
import { acFailRepeats, mostRecentFailedAcId } from '../src/lib/ralph.js';

const FAILURE_CATEGORIES: ReadonlySet<FailureCategory> = new Set([
  'under_specification',
  'contradiction',
  'implementation_bug',
]);

function isFailureCategory(value: unknown): value is FailureCategory {
  return typeof value === 'string' && FAILURE_CATEGORIES.has(value as FailureCategory);
}

function main(): void {
  const args = parseArgs();
  const trigger = UnstuckTriggerSchema.parse(getString(args, 'trigger') ?? 'manual');
  const suggestion = getString(args, 'suggestion') ?? '';
  const context = getString(args, 'context') ?? '';
  const applied = getBool(args, 'applied');

  const state = loadState();

  let persona;
  const personaArg = getString(args, 'persona');
  if (personaArg) {
    if (!isPersonaName(personaArg)) {
      throw new Error(
        `--persona must be one of contrarian|hacker|simplifier|researcher|architect, got "${personaArg}"`,
      );
    }
    persona = PersonaNameSchema.parse(personaArg);
  } else {
    const categoryArg = getString(args, 'category') ?? 'implementation_bug';
    if (!isFailureCategory(categoryArg)) {
      throw new Error(
        `--category must be one of under_specification|contradiction|implementation_bug, got "${categoryArg}"`,
      );
    }
    const recentAc = mostRecentFailedAcId(state);
    const repeats = recentAc ? acFailRepeats(state, recentAc) : 1;
    persona = pickPersonaForFailure(categoryArg, repeats);
  }

  const entry = UnstuckEntrySchema.parse({
    persona,
    trigger,
    context,
    suggestion,
    applied,
    recorded_at: new Date().toISOString(),
  });
  state.unstuck.push(entry);
  saveState(state);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        persona,
        trigger,
        applied,
        entries_total: state.unstuck.length,
      },
      null,
      2,
    ) + '\n',
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`unstuck-record error: ${(err as Error).message}\n`);
  process.exit(1);
}
