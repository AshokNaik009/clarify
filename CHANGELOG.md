# Changelog

All notable changes to clarify are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`clarify ralph`** — bounded meta-orchestrator over `evaluate` + `evolve`. Drives
  the loop to a terminal state (`converged`, `exhausted`, `iteration_timeout`,
  `total_timeout`, `stagnated_*`, `failed`, `interrupted`) without manual
  babysitting. Honest hard caps via `--max-iterations` (default 10),
  `--per-iteration-timeout-ms` (30 min), `--total-timeout-ms` (2 h), and
  `--stuck-threshold` (3 consecutive `no_progress` iterations).
  - New scripts: `scripts/ralph-init.ts`, `scripts/ralph-step.ts`,
    `scripts/ralph-finalize.ts`.
  - New pure helpers in `src/lib/ralph.ts`: `shouldTerminate`,
    `summarizeAcProgress`, `mostRecentFailedAcId`, `acFailRepeats`,
    `reasonToStatus`.
  - Skill at `skills/ralph/SKILL.md`.
- **`clarify unstuck [persona]`** — lateral-thinking escalation through one of five
  personas (`contrarian`, `hacker`, `simplifier`, `researcher`, `architect`).
  Manually invokable; auto-invoked once by Ralph when it would otherwise
  terminate as `stagnated`, before giving up. Auto-pick rule:
  - `contradiction` → `contrarian`
  - `under_specification` → `researcher`
  - `implementation_bug` (≥3 repeats on the same AC) → `architect`
  - `implementation_bug` (<3 repeats) → `hacker`
  - default → `simplifier`
  - New script: `scripts/unstuck-record.ts`.
  - Persona prompts at `src/personas/{contrarian,hacker,simplifier,researcher,architect}.md`
    (slim ports of the corresponding ouroboros agents).
  - Skill at `skills/unstuck/SKILL.md`.
- **State schema additions** (`src/schema/state.ts`):
  - `RalphIterationSchema`, `RalphConfigSchema`, `RalphStatusSchema`, `RalphSchema`.
  - `PersonaNameSchema`, `UnstuckTriggerSchema`, `UnstuckEntrySchema`.
  - `StateSchema` extended with optional `ralph` and array `unstuck` (default `[]`).
- **Docs**: Recipe 5 (Ralph until convergence), Recipe 6 (manual unstuck by
  persona), and a "Ralph: meta-orchestrator over evaluate + evolve" /
  "Unstuck: escalation hatch" section in `docs/architecture.md`.
- **Tests**: 26 new cases — `tests/unit/lib-ralph.test.ts`,
  `tests/unit/lib-personas.test.ts`, `tests/unit/script-ralph.test.ts`, plus
  fixture `tests/fixtures/seed.failing.yaml`.

### Notes

- Ralph deliberately never re-prompts Claude through `claude -p` for code
  edits — the active session does the work. Scripts are pure plumbing.
- Out of scope (consistent with [`SPEC.md`](./SPEC.md) §2.1): MCP tool
  registration, EventStore / lineage reconstruction, plugin delegation,
  `ouroboros_lateral_think` MCP tool, async / parallel AC execution.
- Ported (with simplifications) from
  [`Q00/ouroboros`](https://github.com/Q00/ouroboros): `ralph_loop.py`,
  `skills/unstuck/SKILL.md`, and the five `agents/{persona}.md` files.

## [0.1.0]

### Added

- Initial release. Six commands as Claude Code skills:
  - `clarify interview "<idea>"` — Socratic Q&A → writes
    `.clarify/seed.yaml`.
  - `clarify run` — execute the seed's acceptance-criteria tree.
  - `clarify evaluate [--ac AC-X | --all]` — 3-stage pipeline (mechanical →
    LLM review → consensus).
  - `clarify evolve` — diagnose failures (`under_specification` /
    `contradiction` / `implementation_bug`); rewrite seed or fix code; retry.
  - `clarify status [--deep]` — drift detection: scope (cheap) + intent
    (LLM, opt-in).
  - `clarify help` — print the available commands.
- Pluggable backend interface (`src/backends/types.ts`); v1 ships
  `ClaudeBackend` only.
- State on disk under `.clarify/`: `seed.yaml`, `state.json`,
  `transcripts/<ts>.md`, `evolutions/<n>.yaml`. All YAML/JSON validated
  against zod schemas on every read and write.
- Hard caps via seed thresholds: `ambiguity_max` (0.2), `consensus_min`
  (0.8), `drift_warn` (0.3), `drift_fail` (0.7), `max_evolutions` (3).
- `CLARIFY_FAKE_CLAUDE` env var to short-circuit `claude -p` calls in CI
  and unit tests.

[Unreleased]: https://github.com/AshokNaik009/clarify/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/AshokNaik009/clarify/releases/tag/v0.1.0
