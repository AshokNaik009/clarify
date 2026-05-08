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
