import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROMPTS_DIR = resolve(__dirname, '..', 'prompts');

export type PromptName =
  | 'crystallize'
  | 'llm-review'
  | 'analyze-failure'
  | 'rewrite-seed'
  | 'intent-drift';

export function loadPrompt(name: PromptName): string {
  const path = join(PROMPTS_DIR, `${name}.md`);
  return readFileSync(path, 'utf8');
}

export function fillPrompt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    const v = vars[key as string];
    return v === undefined ? `{{${key}}}` : v;
  });
}

export function renderPrompt(name: PromptName, vars: Record<string, string>): string {
  return fillPrompt(loadPrompt(name), vars);
}
