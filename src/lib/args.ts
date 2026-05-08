/**
 * Minimal arg parser. No deps. Supports:
 *   --flag                  → { flag: true }
 *   --key value             → { key: 'value' }
 *   --key=value             → { key: 'value' }
 *   positional              → in `_`
 *
 * Repeated keys collect into an array.
 */
export interface ParsedArgs {
  _: string[];
  [key: string]: string | string[] | boolean | undefined;
}

export function parseArgs(argv: string[] = process.argv.slice(2)): ParsedArgs {
  const out: ParsedArgs = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === undefined) continue;
    if (tok.startsWith('--')) {
      const eq = tok.indexOf('=');
      let key: string;
      let val: string | true;
      if (eq !== -1) {
        key = tok.slice(2, eq);
        val = tok.slice(eq + 1);
      } else {
        key = tok.slice(2);
        const peek = argv[i + 1];
        if (peek !== undefined && !peek.startsWith('--')) {
          val = peek;
          i++;
        } else {
          val = true;
        }
      }
      const existing = out[key];
      if (existing === undefined) {
        out[key] = val;
      } else if (Array.isArray(existing)) {
        if (val !== true) existing.push(val);
      } else {
        if (typeof existing === 'string' && typeof val === 'string') {
          out[key] = [existing, val];
        } else {
          out[key] = val;
        }
      }
    } else {
      out._.push(tok);
    }
  }
  return out;
}

export function getString(args: ParsedArgs, key: string): string | undefined {
  const v = args[key];
  if (typeof v === 'string') return v;
  return undefined;
}

export function requireString(args: ParsedArgs, key: string): string {
  const v = getString(args, key);
  if (v === undefined) throw new Error(`Missing required --${key}`);
  return v;
}

export function getBool(args: ParsedArgs, key: string): boolean {
  return args[key] === true;
}
