import { describe, it, expect } from 'vitest';
import { loadPrompt, fillPrompt, renderPrompt } from '../../src/lib/prompts.js';

describe('lib/prompts', () => {
  it('loadPrompt returns non-empty content', () => {
    const p = loadPrompt('crystallize');
    expect(p.length).toBeGreaterThan(100);
    expect(p).toContain('{{IDEA}}');
  });

  it('fillPrompt substitutes placeholders', () => {
    const out = fillPrompt('hello {{NAME}} from {{PLACE}}', { NAME: 'ash', PLACE: 'home' });
    expect(out).toBe('hello ash from home');
  });

  it('fillPrompt leaves unknown placeholders intact', () => {
    const out = fillPrompt('hi {{X}}', {});
    expect(out).toBe('hi {{X}}');
  });

  it('renderPrompt loads + fills', () => {
    const out = renderPrompt('crystallize', {
      IDEA: 'todo cli',
      TRANSCRIPT: 't',
      SLOTS_JSON: '{}',
    });
    expect(out).toContain('todo cli');
    expect(out).not.toContain('{{IDEA}}');
  });
});
