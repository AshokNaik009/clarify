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

## Brownfield support: what changes

`clarify` works on existing codebases without breaking the greenfield flow. The brownfield-mode additions are deliberately additive:

- **`clarify scan`** runs `src/personas/codebase-explorer.md` via `claude -p` over the project's manifests (`package.json`, `pyproject.toml`, `tsconfig.json`, `Dockerfile`, `pnpm-workspace.yaml`, `turbo.json`, `Cargo.toml`, `go.mod`, …) and writes a ≤500-word summary into `state.scan` (`scanned_at`, `tech_stack`, `summary`, `manifests`, `package_manager`, `is_brownfield`). Idempotent — re-running overwrites the snapshot.
- **`clarify ingest <ticket>`** is the brownfield-native entry point. It runs in **two phases** to mirror how ouroboros bridges from PM input to a runnable seed:
  - **Phase 1 (`scripts/ingest-ticket.ts`, `MODE=draft`).** One `claude -p` call against `src/personas/seed-architect.md` returns `{ draft_seed, gaps[] }`. `applyGapCap` (in `src/lib/ingest.ts`) truncates `gaps` to ≤5 entries; overflow questions become `seed.brownfield.unresolved_gaps[]` immediately. The draft envelope (`{ ticket_ref, ticket_text, draft }`) is written to `.clarify/ingest-draft.json`. If `gaps` is empty (or the user passed `--no-bridge`), the draft is finalized in the same run and the envelope is cleared. Lineage and `brownfield.project_type` are forced regardless of what the LLM emits.
  - **Phase 2 (`scripts/ingest-finalize.ts`, `MODE=finalize`).** The skill collected user answers via `AskUserQuestion` (with a "Decide later" option per gap). The script reads the draft envelope plus an answers JSON array (`{field, question, answer, deferred}[]`), runs one more `claude -p` with the answers folded into the prompt, validates the response against `SeedSchema`, unions any deferred questions into `brownfield.unresolved_gaps`, and writes `.clarify/seed.yaml`. The draft envelope is unlinked.
  - Single bridging round only — by design, ingest does not loop. Anything still unresolved after Phase 2 stays in `unresolved_gaps[]` for the LLM-review prompt to see on every AC review.
- **`clarify detect`** authors `seed.mechanical_checks` from the manifests in one LLM call. It refuses to overwrite existing checks unless `--force` is passed. Run automatically before the first `clarify evaluate` if the array is empty.
- **Interview routing** (`skills/interview/SKILL.md`) gains five paths: PATH 1a auto-confirms manifest-known facts (no user block), PATH 1b shows code-derived findings to the user as confirm/correct prompts, PATH 2 routes human-judgment questions, PATH 3 handles code + judgment, PATH 4 handles research interludes. The **Dialectic Rhythm Guard** (`src/lib/dialectic.ts`) routes the next question to the user (PATH 2) after three consecutive non-user answers. Greenfield projects (no `state.scan`, no manifests at root) skip all five paths and behave exactly as before.
- **LLM review** (`scripts/eval-llm.ts` + `src/lib/brownfield-prompt.ts`) injects `tech_stack`, `existing_patterns`, `existing_dependencies`, `forbidden_new_dependencies`, and the last 5 `git log --oneline` entries scoped to the AC's `allowed_paths` whenever the seed has `brownfield.project_type === "brownfield"`. Reviewers can fail diffs that violate existing patterns even if they satisfy the AC text in isolation.
- **Evolve** (`scripts/evolve-analyze.ts`) recognizes a fourth failure category: `pre_existing_behavior`. The legacy bug was already broken before this AC's diff landed; the analyzer instructs the loop to scope a separate AC for the legacy module rather than re-rolling the current one.

What is **not** ported from ouroboros: the multi-repo SQLite registry (`brownfield scan`/`set` subcommands), the `publish` skill (Seed → GitHub Issues), MCP tools (`ouroboros_brownfield`, `ouroboros_pm_interview`, etc.). `clarify` stays MCP-free per `SPEC.md` §3.3. Mechanical checks remain a single `seed.mechanical_checks` array — no separate `mechanical.toml` file (parity with the slim spec, easier to reason about, fewer files to keep in sync).
