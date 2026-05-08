import { describe, it, expect } from 'vitest';
import { parseArgs, getString, requireString, getBool } from '../../src/lib/args.js';

describe('lib/args', () => {
  it('parses flags and key/values', () => {
    const a = parseArgs(['--foo', 'bar', '--flag', '--baz=qux', 'pos']);
    expect(getString(a, 'foo')).toBe('bar');
    expect(getBool(a, 'flag')).toBe(true);
    expect(getString(a, 'baz')).toBe('qux');
    expect(a._).toEqual(['pos']);
  });

  it('requireString throws when missing', () => {
    expect(() => requireString(parseArgs([]), 'x')).toThrow();
  });

  it('repeated flags collect into array', () => {
    const a = parseArgs(['--tag', 'a', '--tag', 'b']);
    expect(Array.isArray(a.tag)).toBe(true);
    expect(a.tag).toEqual(['a', 'b']);
  });
});
