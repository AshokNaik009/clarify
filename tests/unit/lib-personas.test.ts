import { describe, it, expect } from 'vitest';
import {
  PERSONA_NAMES,
  pickPersonaForFailure,
  loadPersonaPrompt,
  isPersonaName,
} from '../../src/lib/personas.js';

describe('lib/personas auto-pick rules', () => {
  it('contradiction → contrarian (challenge spec assumption)', () => {
    expect(pickPersonaForFailure('contradiction', 1)).toBe('contrarian');
    expect(pickPersonaForFailure('contradiction', 9)).toBe('contrarian');
  });

  it('under_specification → researcher (gather missing data)', () => {
    expect(pickPersonaForFailure('under_specification', 1)).toBe('researcher');
  });

  it('implementation_bug with <3 repeats → hacker (workaround)', () => {
    expect(pickPersonaForFailure('implementation_bug', 1)).toBe('hacker');
    expect(pickPersonaForFailure('implementation_bug', 2)).toBe('hacker');
  });

  it('implementation_bug with ≥3 repeats → architect (restructure)', () => {
    expect(pickPersonaForFailure('implementation_bug', 3)).toBe('architect');
    expect(pickPersonaForFailure('implementation_bug', 5)).toBe('architect');
  });
});

describe('lib/personas registry', () => {
  it('PERSONA_NAMES has exactly the five expected names', () => {
    expect([...PERSONA_NAMES].sort()).toEqual(
      ['architect', 'contrarian', 'hacker', 'researcher', 'simplifier'].sort(),
    );
  });

  it('isPersonaName narrows correctly', () => {
    expect(isPersonaName('contrarian')).toBe(true);
    expect(isPersonaName('not-a-real-persona')).toBe(false);
    expect(isPersonaName(123)).toBe(false);
    expect(isPersonaName(undefined)).toBe(false);
  });

  it('loadPersonaPrompt returns markdown content for each persona', () => {
    for (const name of PERSONA_NAMES) {
      const prompt = loadPersonaPrompt(name);
      expect(prompt.length).toBeGreaterThan(0);
      // Each persona file starts with a top-level heading using the persona name (capitalized).
      const heading = `# ${name.charAt(0).toUpperCase()}${name.slice(1)}`;
      expect(prompt).toContain(heading);
    }
  });
});
