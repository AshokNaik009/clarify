# Changelog

All notable changes to clarify are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] — 2026-05-09

### Added

- **Brownfield mode** — three new commands plus interview routing so `clarify`
  works on existing codebases, not just greenfield prototypes.
  - `clarify scan` — runs the `codebase-explorer` persona via `claude -p` over
    the project's manifests (`package.json`, `pyproject.toml`, `tsconfig.json`,
    `Dockerfile`, `pnpm-workspace.yaml`, `turbo.json`, `Cargo.toml`, `go.mod`,
    …) and writes a ≤500-word summary into `.clarify/state.json` under
    `state.scan`. Idempotent.
  - `clarify ingest <ticket>` — brownfield-native entry point. Reads a Jira /
    Linear / PM ticket (file path or `--text "<paste>"`), combines it with
    the scan, runs the `seed-architect` persona in **two phases**: Phase 1
    drafts the seed and surfaces up to 5 high-impact gap questions the
    ticket left open; Phase 2 re-runs the persona with the user's gap
    answers folded in and writes the final `.clarify/seed.yaml`. Skips
    Phase 2 entirely when the ticket is unambiguous (`gaps: []`) or when
    `--no-bridge` is passed. Mirrors the ouroboros two-stage `pm` →
    `interview` → `seed` pattern at a fraction of the surface area.
  - `clarify ingest --finalize --answers <json>` — Phase 2 entry. Reads
    `.clarify/ingest-draft.json`, runs one more `claude -p`, validates the
    final seed against `SeedSchema`, and writes the seed file. The skill
    invokes this automatically after collecting gap answers via
    `AskUserQuestion`; users normally don't call it directly.
  - `clarify detect` — one LLM call against the project's manifests fills
    `seed.mechanical_checks` with the project's actual lint / typecheck /
    test / build commands. `--force` to overwrite.
  - **Interview routing** — `skills/interview/SKILL.md` extended with PATH
    1a (auto-confirm manifest-known facts), PATH 1b (code-confirmation),
    PATH 2 (human judgment), PATH 3 (code + judgment), PATH 4 (research
    interlude), and the **Dialectic Rhythm Guard** (after 3 consecutive
    non-user answers, the next question MUST be PATH 2). Greenfield
    behavior is unchanged when no manifests are present.
- **Schema additions**:
  - `BrownfieldContextSchema` and `ContextReferenceSchema` in
    `src/schema/seed.ts`. `SeedSchema.brownfield` is optional;
    `SeedSchema.lineage` gains an optional `ticket_ref` and accepts a new
    `source: "ingest"`. `BrownfieldContextSchema.unresolved_gaps: string[]`
    captures verbatim gap questions the user deferred during ingest plus
    any overflow beyond the 5-question hard cap; the LLM-review prompt
    sees them on every AC review.
  - `ScanSnapshotSchema` in `src/schema/state.ts`. `StateSchema.scan` is
    optional; existing greenfield states still parse.
  - `GapSchema`, `GapAnswerSchema`, `DraftSchema` in `src/lib/ingest.ts`
    govern the Phase-1 envelope written to `.clarify/ingest-draft.json`
    between `clarify ingest` and `clarify ingest --finalize`.
- **Pre-existing-behavior failure category** — `evolve-analyze.ts` now
  recognizes `pre_existing_behavior` (the bug was in the legacy code, not
  the current AC's diff) so brownfield evolution doesn't keep re-rolling a
  passing AC against a legacy bug.
- **Brownfield-aware LLM review** — `eval-llm.ts` injects `tech_stack`,
  `existing_patterns`, `existing_dependencies`, `forbidden_new_dependencies`,
  `unresolved_gaps` (deferred-during-ingest questions plus 5-cap overflow),
  and the last 5 `git log --oneline` entries scoped to the AC's
  `allowed_paths` whenever the seed has `brownfield.project_type === "brownfield"`.
- **Libraries**:
  - `src/lib/manifests.ts` — pure helpers: `discoverManifests`,
    `inferPackageManager`, `inferBrownfield`, `readManifestSnippets`.
  - `src/lib/dialectic.ts` — pure helper: `makeDialecticState`,
    `recordAnswer`, `mustRouteToUser`, `replay`.
  - `src/lib/brownfield-prompt.ts` — pure helper: `buildBrownfieldBlock`
    that the LLM-review prompt embeds.
  - `src/lib/ingest.ts` — pure helpers: `applyGapCap` (≤5 hard cap with
    overflow returned separately), draft envelope read/write, schema
    definitions for `Gap`/`GapAnswer`/`Draft`.
  - `src/lib/git.ts` — new `recentLogForPaths` helper.
- **Personas**: `src/personas/codebase-explorer.md` and
  `src/personas/seed-architect.md` (slim ports of the corresponding
  ouroboros agents).
- **Docs**:
  - README — new "Brownfield mode" section, three new command rows,
    "What it does" updated to call out greenfield + brownfield.
  - `docs/architecture.md` — new "Brownfield support: what changes"
    section.
  - `docs/recipes.md` — Recipe 7 (ticket → ingest → ralph) and Recipe 8
    (legacy module fix with git-log-aware LLM review).
- **Tests**: new unit tests for manifests, dialectic guard, brownfield
  schema, brownfield-prompt builder, ingest gap-cap & draft envelope;
  smoke tests for `scan`, `detect`, `ingest` (no-gaps fast path,
  draft-with-gaps path, `--no-bridge`, ≥6-gap overflow → unresolved_gaps
  merge), and `ingest --finalize` (draft-missing rejection, deferred-gap
  merge). New fixtures: `manifest.node.package.json`,
  `manifest.python.pyproject.toml`, `ticket.bug.md`, `ticket.feature.md`.

### Changed

- `clarify ingest` is now a **two-phase** flow with a single bridging
  interview round (≤5 questions, hard-capped). Greenfield projects are
  unaffected. Pass `--no-bridge` to keep the previous one-shot behavior.
- `clarify interview` auto-confirms manifest-derived facts (PATH 1a) and
  routes only judgment questions to the user when a brownfield project is
  detected. Greenfield path is unchanged.
- The LLM-review prompt template (`src/prompts/llm-review.md`) now contains
  a `{{BROWNFIELD_BLOCK}}` slot that is empty for greenfield seeds.
- `evolve-analyze` recognizes the new `pre_existing_behavior` category in
  addition to `under_specification`, `contradiction`, `implementation_bug`.

### Notes

- Mechanical checks remain a single source of truth on the seed's
  `mechanical_checks` array — no separate `mechanical.toml` file (unlike
  ouroboros).
- Multi-repo SQLite registry and `clarify publish` (Seed → GitHub Issues)
  are deliberately NOT ported — see `SPEC.md` §2.1.
- Ouroboros provenance for the `codebase-explorer` and `seed-architect`
  personas plus the brownfield interview routing.

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

[Unreleased]: https://github.com/AshokNaik009/clarify/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/AshokNaik009/clarify/compare/v0.1.0...v0.3.0
[0.1.0]: https://github.com/AshokNaik009/clarify/releases/tag/v0.1.0
