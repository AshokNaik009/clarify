# Architecture

`clarify` is a Claude Code plugin made of three layers:

1. **Skills** (Markdown) — what Claude reads to decide what to do next.
2. **Scripts** (TypeScript via `tsx`) — pure, deterministic plumbing. They read/write a single state file and shell out to `claude -p` only when LLM judgment is needed headless.
3. **State** (JSON + YAML on disk) — `.clarify/seed.yaml` (immutable contract) + `.clarify/state.json` (live).

## Loop

```
Interview → Seed → Execute → Evaluate → Evolve
    ↑                                   ↓
    └────── (only on persistent failure) ┘
```

Each step has a skill and one or more scripts. The skill decides when to think (in-session, via Claude) versus when to call a script.

## Why no AI SDK

There is no `@anthropic-ai/sdk`. All "intelligence" lives in either:

- the active Claude Code session (when the user is watching), or
- a `claude -p "<prompt>"` shell-out (headless, inside a script).

This means clarify has zero API keys to manage and zero SDK churn. If `claude` CLI is on PATH, you're done.

## Pluggable backend

`src/backends/types.ts` defines a thin `Backend` interface (`oneShot(prompt)`). v1 ships `ClaudeBackend` only. Adding `OpenAIBackend` later is a single new file plus a switch case in `selectBackend()`.

## State on disk

| Path | Purpose |
|---|---|
| `.clarify/seed.yaml` | The current immutable contract. |
| `.clarify/state.json` | Phase, AC status, evaluations, drift, evolutions. |
| `.clarify/transcripts/<ts>.md` | Interview snapshots. |
| `.clarify/evolutions/<n>.yaml` | Each evolved seed. |

Both files validate against zod schemas (`src/schema/seed.ts`, `src/schema/state.ts`) on every read and write — invalid state crashes loudly rather than corrupting silently.

## 3-stage evaluation

For each AC:

1. **Mechanical** — every command in `seed.mechanical_checks` runs via `sh -c`; non-zero exit = fail.
2. **LLM review** — `claude -p` is shown the AC + diff scoped to `allowed_paths` and returns `{score, verdict, notes}`.
3. **Consensus** — pass iff mechanical-all-pass AND `llm.score >= thresholds.consensus_min` (default 0.8).

## Drift detection

Two signals:

- **scope** (cheap) — fraction of recently-modified files not covered by any AC's `allowed_paths`.
- **intent** (`--deep` only) — `claude -p` semantically scores how far the diff has wandered from the seed.

Verdict thresholds: `aligned` < `drift_warn` ≤ `drifting` < `drift_fail` ≤ `diverged`.

## Ralph: meta-orchestrator over evaluate + evolve

`clarify ralph` does not invent new evaluation or evolution logic. It chains the existing `eval-*` and `evolve-*` scripts inside a bounded loop and writes per-iteration outcomes to `state.ralph`. The loop terminates on the first of: all root ACs `passed` (`converged`), an iteration timing out (`iteration_timeout`), wall-clock total cap (`total_timeout`), iteration cap (`exhausted`), `N` consecutive `no_progress` iterations (`stagnated_*`), an inner script returning non-zero (`failed`), or Ctrl-C (`interrupted`).

Stagnation handling deliberately includes one escalation step: when the loop would otherwise terminate as `stagnated` AND `auto_unstuck` is on AND no prior unstuck attempt exists, Ralph runs `clarify unstuck` once with `--trigger ralph_stagnated`, applies the persona's reframing in-session, and gives the loop one final attempt. If that final attempt also makes no progress, Ralph terminates as `stagnated_after_unstuck` — a hard signal that human attention is needed.

## Unstuck: escalation hatch

`clarify unstuck` is the one-shot lateral-thinking step. Five personas live in `src/personas/{contrarian,hacker,simplifier,researcher,architect}.md`. The unstuck skill reads the persona prompt, applies that lens to the most recent failed AC, and surfaces a concrete next step (edit the seed, drop the AC, change `allowed_paths`, apply a workaround). The active session does the reasoning; `scripts/unstuck-record.ts` only persists the persona invocation and the suggestion to `state.unstuck[]`. There is no MCP tool, no separate model call, no async dispatch — the persona prompts are the surface area.
