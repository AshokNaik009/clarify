---
name: clarify-unstuck
description: Reframe a stuck AC through one of five lateral-thinking personas (contrarian, hacker, simplifier, researcher, architect). Manually invokable; auto-invoked once by Ralph when it would otherwise stagnate.
trigger: "clarify unstuck"
---

# clarify unstuck [persona]

Use when the eval→evolve loop has spun on the same failing AC and you need a different lens. Five personas live in `src/personas/`:

| Persona | Stance | Use when |
|---|---|---|
| `contrarian` | "What if we're solving the wrong problem?" | Same failure recurs in different forms; spec assumption may be wrong. |
| `hacker` | "Make it work first; elegance later." | Overthinking blocks progress; need a workaround. |
| `simplifier` | "Cut scope; return to MVP." | Complexity is overwhelming; the AC tree is too ambitious. |
| `researcher` | "What information are we missing?" | The problem is unclear; LLM review keeps citing missing context. |
| `architect` | "Restructure the approach entirely." | Same AC has failed 3+ iterations; structure is wrong. |

## Argument resolution

- `clarify unstuck contrarian|hacker|simplifier|researcher|architect` → use that persona.
- `clarify unstuck` (no arg) → auto-pick from the most recent failure category in `state.evaluations`. The auto-pick rules are:
  - `contradiction` → contrarian
  - `under_specification` → researcher
  - `implementation_bug` (≥3 repeats on the same AC) → architect
  - `implementation_bug` (<3 repeats) → hacker
  - default → simplifier

## Step 1 — adopt the persona

Read `src/personas/<persona>.md` (it's short — one stance line, three reframing questions, a "what to try" paragraph). Apply that lens to the most recent failed AC: read the AC from `seed.yaml`, the latest `state.evaluations` row for it (LLM review notes are the most useful), and any `/tmp/clarify-analysis.json` from a recent `clarify evolve`.

## Step 2 — produce a concrete reframing

In one short paragraph:
1. Restate the assumption / constraint / structure the persona challenges.
2. Name one concrete next step — usually edit the seed AC, change `allowed_paths`, drop the AC, add a clarifying mechanical check, or apply a code workaround.

## Step 3 — record and (optionally) apply

```bash
npx tsx ${CLAUDE_PLUGIN_DIR:-.}/scripts/unstuck-record.ts \
  [--persona <name>] \
  [--trigger manual|ralph_stagnated] \
  [--category under_specification|contradiction|implementation_bug] \
  [--context "<one-line context>"] \
  [--suggestion "<the reframing + concrete step>"] \
  [--applied]
```

- Pass `--persona` only if you want to override the auto-pick.
- Pass `--trigger ralph_stagnated` only when invoked from inside `clarify ralph`.
- Pass `--applied` if you actually edited the seed or the code in this session.

The script appends an entry to `state.unstuck` and prints the recorded persona + total entries.

## When invoked from Ralph

Ralph passes `--trigger ralph_stagnated`. After this single attempt, Ralph will terminate with `stagnated_after_unstuck` if the next iteration still makes no progress — one persona, one final attempt, then stop. The plan is to surface a hard signal that human attention is needed, not to spin forever.
