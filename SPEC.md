# clarify — Specification

> Status: **Draft 0** (pre-implementation). This document is the contract. Implementation follows on approval.
> Date: 2026-05-08
> Author: Ashok Naik
> Inspired by: [Q00/ouroboros](https://github.com/Q00/ouroboros) (Python). This is a TypeScript-native, deliberately-slim port for the Claude Code plugin ecosystem.

---

## 1. Thesis

> **Most AI coding fails at the input, not the output.**

Developers describe what they want in 1–2 sentences, hand it to an AI agent, and get back code that's *plausible* but *wrong*. The failure isn't the model — it's that the spec was never written down before code generation began.

`clarify` is a Claude Code plugin that puts a structured **specification phase** in front of every coding task. It runs a Socratic interview to surface hidden assumptions, crystallizes the answers into an immutable **seed spec** with an acceptance-criteria tree, executes against that tree, evaluates the result, and evolves the spec based on what was learned.

The shorthand: **Interview → Seed → Execute → Evaluate → Evolve.** The output of evaluation feeds back into a new interview, closing the loop.

---

## 2. Scope — What ships in v1

We deliberately ship a **slim** subset of the Ouroboros feature set. Five features only:

| # | Feature | One-line definition |
|---|---------|---------------------|
| 1 | **Socratic Interview** | LLM-driven Q&A that drives ambiguity from the user's request below a threshold |
| 2 | **Seed Spec + AC Tree** | Immutable YAML spec containing the hierarchical acceptance-criteria tree |
| 3 | **3-Stage Evaluation Pipeline** | Mechanical (shell exit code) → LLM review → consensus gate |
| 4 | **Evolution Loop** | After eval, refine the seed and re-run; iterate until all ACs pass |
| 5 | **Drift Detection** | Continuous scope-drift (cheap) + opt-in intent-drift (deep LLM judgment) |

**Architecture concern (not a feature):** a **pluggable backend interface** so non-Claude runtimes (Codex, OpenAI, local models) can be added later without rewriting. v1 ships **Claude only**.

### 2.1 Explicitly out of scope for v1

The following exist in Ouroboros and are **deliberately omitted** here. Adding them is a v2 conversation.

- TUI / dashboard / charts
- MCP server (we use plain `npx tsx` scripts instead)
- Ralph-style persistent loops
- Multiple-backend runtime adapters (Codex, OpenCode, Copilot)
- Brownfield analyzer
- PM mode, publish-to-issues
- Event-sourced SQLite store (we use a single JSON state file)
- Lineage screens, cost tracker UI, parallel-graph visualizer
- Setup wizard, tutorial walkthrough, welcome screen
- Multi-language i18n READMEs

---

## 3. Distribution & Runtime Model

### 3.1 Distribution
`clarify` ships as a **Claude Code plugin** installable via the marketplace:

```bash
claude plugin marketplace add AshokNaik009/clarify
claude plugin install clarify@clarify
```

Once installed, every command is a slash-command-style trigger inside a Claude Code session.

### 3.2 Runtime
Skills are markdown files (`SKILL.md`) that Claude reads and follows. When deterministic work is needed, the skill instructs Claude to invoke a TypeScript script via the bash tool:

```bash
npx tsx ${CLAUDE_PLUGIN_DIR}/scripts/<step>.ts --state .clarify/state.json [args...]
```

`tsx` runs TypeScript inline — no compile step in dev. For shipping we still run `tsc` to produce a `dist/` so runtime startup stays fast on cold installs (optional fallback to `tsx`).

### 3.3 LLM access
Two patterns, both using the user's existing Claude Code authentication — **no separate `ANTHROPIC_API_KEY` required**:

1. **In-session LLM work**: skills tell the active Claude session to do the LLM thinking (interview question generation, semantic eval) directly, then write results back via a recording script.
2. **Headless LLM work inside scripts**: when a script needs LLM judgment without user attention (e.g., looping LLM-review over each AC), it shells out to `claude -p "<prompt>"` via `child_process.execSync`. Output is parsed (typically structured JSON requested in the prompt).

**Consequence:** the package has **zero AI SDK dependencies**. No `@anthropic-ai/sdk`, no `openai`, nothing. The "intelligence" lives in skill prompts and `claude -p` calls; the scripts are pure deterministic plumbing.

---

## 4. Architecture

### 4.1 High-level

```
┌─────────────────────────────────────────────────────────┐
│                Claude Code (host)                       │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Skills (Markdown — instructions for Claude)      │  │
│  │  skills/{interview,run,evaluate,evolve,status}/   │  │
│  │  └── SKILL.md                                     │  │
│  └─────────────────┬─────────────────────────────────┘  │
│                    │ Claude reads skill, decides        │
│                    │ when to call scripts vs think      │
│                    ▼                                    │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Scripts (TypeScript — pure deterministic logic)  │  │
│  │  scripts/*.ts  (run via `npx tsx`)                │  │
│  │  • Read/write .clarify/state.json                 │  │
│  │  • Validate seed against zod schemas              │  │
│  │  • Exec mechanical_checks shell commands          │  │
│  │  • Compute scope-drift from file→AC mapping       │  │
│  │  • Optionally shell out to `claude -p` for        │  │
│  │    headless LLM judgment                          │  │
│  └─────────────────┬─────────────────────────────────┘  │
│                    │                                    │
│                    ▼                                    │
│  ┌───────────────────────────────────────────────────┐  │
│  │  State                                            │  │
│  │  .clarify/seed.yaml   (immutable contract)        │  │
│  │  .clarify/state.json  (live execution state)      │  │
│  │  .clarify/transcripts/<ts>.md  (interview logs)   │  │
│  │  .clarify/evolutions/<n>.yaml (each evolved seed) │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Backend abstraction
A single TS interface:

```ts
// src/backends/types.ts
export interface Backend {
  name: 'claude' | 'codex' | 'openai' | string;
  // Headless single-shot LLM call. Returns assistant text.
  oneShot(prompt: string, opts?: { json?: boolean; timeoutMs?: number }): Promise<string>;
  // Capabilities introspection — used to gate features per backend.
  capabilities(): { supportsToolUse: boolean; maxContextTokens: number };
}
```

v1 ships **`ClaudeBackend`** which implements `oneShot` by `execSync('claude -p ...')`. Adding an OpenAI backend later means writing `OpenAIBackend` that uses `fetch` against the OpenAI API — no other code changes needed.

The active backend is selected via `seed.backend: claude` (default) or `CLARIFY_BACKEND=claude` env var.

---

## 5. Data Model

### 5.1 The seed (`.clarify/seed.yaml`)

The seed is the **immutable contract** for one execution cycle. Once crystallized, it is never mutated — evolution writes a new seed under `.clarify/evolutions/<n>.yaml`. Human-readable on purpose (YAML, comments allowed).

```yaml
# .clarify/seed.yaml
version: 1
id: seed-2026-05-08-todo-app
created_at: 2026-05-08T10:30:00Z
backend: claude

description: |
  A small, single-user todo CLI. Persists to a local JSON file.
  Supports add, list, complete, remove. No network, no auth.

constraints:
  language: typescript
  runtime: node>=20
  packaging: single npm package
  forbidden_paths:
    - node_modules/**
    - dist/**
  allowed_globals:
    - process.env

# The unit of progress tracking. Recursive. Each AC is a leaf or has children.
acceptance_criteria:
  - id: AC-1
    title: CLI supports add/list/complete/remove subcommands
    intent: |
      User can run `todo add "buy milk"`, `todo list`, `todo complete <id>`,
      `todo remove <id>` and see the expected output.
    allowed_paths: ['src/cli/**', 'src/commands/**']
    children:
      - id: AC-1.1
        title: '`todo add "<text>"` appends an item with a unique id'
        allowed_paths: ['src/commands/add.ts']
      - id: AC-1.2
        title: '`todo list` prints items numbered, with [x] for completed'
        allowed_paths: ['src/commands/list.ts']
      # ... etc

  - id: AC-2
    title: Persistence to ~/.todo/items.json
    intent: All mutations atomically write to the JSON file.
    allowed_paths: ['src/store/**']

# Mechanical checks — the DETERMINISTIC stage of evaluation.
# Plugin runs each command via execSync; non-zero exit = fail.
# Default to lint-only; add more checks (typecheck, tests) only when the user opts in.
mechanical_checks:
  - name: lint
    cmd: npm run lint

# Configurable thresholds.
thresholds:
  ambiguity_max: 0.2          # interview ends when ambiguity drops below this
  consensus_min: 0.8          # eval consensus must be >= for AC to pass
  drift_warn: 0.3             # status flags 'drifting' above this
  drift_fail: 0.7             # status flags 'diverged' above this

# Provenance (audit trail).
lineage:
  source: interview
  interview_transcript: .clarify/transcripts/2026-05-08-103000.md
  parent_seed: null           # set on evolved seeds
```

The seed is parsed at load-time into a typed `Seed` object via a **zod schema** (`src/schema/seed.ts`). Invalid seeds fail loudly with a path-specific error.

### 5.2 The state file (`.clarify/state.json`)

Single JSON file holding the live execution state. Read/written by every script. Easy to inspect, diff, and version-control.

```jsonc
{
  "schema_version": 1,
  "seed_id": "seed-2026-05-08-todo-app",
  "phase": "executing", // 'interviewing' | 'crystallizing' | 'executing' | 'evaluating' | 'evolving' | 'done'
  "started_at": "2026-05-08T10:30:00Z",

  "interview": {
    "turns": [
      { "q": "Is this for a single user or multi-user?", "a": "Single user." },
      { "q": "Where should items persist — file, sqlite, in-memory?", "a": "JSON file in homedir." }
    ],
    "ambiguity_score": 0.15,
    "completed": true
  },

  "ac_status": {
    // AC id → status
    "AC-1": "in_progress",
    "AC-1.1": "passed",
    "AC-1.2": "in_progress",
    "AC-2": "pending"
  },

  "evaluations": [
    {
      "ac_id": "AC-1.1",
      "iteration": 1,
      "mechanical": { "typecheck": "pass", "tests": "pass", "lint": "pass" },
      "llm_review": { "score": 0.92, "verdict": "pass", "notes": "..." },
      "consensus": "pass",
      "evaluated_at": "2026-05-08T11:00:00Z"
    }
  ],

  "drift": {
    "last_checked_at": "2026-05-08T11:05:00Z",
    "scope_score": 0.05,
    "intent_score": null,    // null = not run yet (only --deep populates this)
    "verdict": "aligned",
    "findings": []
  },

  "evolutions": [
    // Set when an evolution cycle is triggered.
    // Each entry references a new seed file under .clarify/evolutions/.
  ]
}
```

### 5.3 The AC tree

A typed tree, in-memory representation of `seed.acceptance_criteria`. Two operations matter:

- `walkLeaves(tree)` — yields every leaf AC for execution and evaluation
- `rollUpStatus(tree, ac_status)` — propagates child status to parent (`passed` only if all children passed; `failed` if any child failed)

A parent AC's `allowed_paths` defaults to the union of its children's paths.

### 5.4 The drift report

```jsonc
{
  "checked_at": "2026-05-08T11:05:00Z",
  "scope": {
    "score": 0.05,
    "rogue_files": []  // files modified in last commit not in any AC's allowed_paths
  },
  "intent": {            // populated only with --deep
    "score": 0.18,
    "narrative": "Code mostly tracks intent; AC-1.2 list output ordering may differ from spec wording."
  },
  "verdict": "aligned"   // 'aligned' | 'drifting' | 'diverged'
}
```

---

## 6. Workflows (per skill)

### 6.1 `clarify interview "<one-line idea>"`

**Goal:** drive ambiguity below `thresholds.ambiguity_max`, then crystallize a seed.

```
1. Skill: read state.json (or initialize with the user's idea).
2. Skill (Claude in-session): generate the next Socratic question
   based on current Q&A turns and known unknowns
   (language, persistence, scale, constraints, success criteria).
3. Claude asks user the question; user answers in chat.
4. Skill: invoke `npx tsx scripts/interview-record.ts --q '...' --a '...'`
   which appends to state.json and recomputes ambiguity_score.
   Ambiguity is deterministic: it counts how many of the canonical slots
   (language, runtime, persistence, scope, success_criteria, constraints)
   are still unfilled. score = unfilled / total.
5. If ambiguity_score > threshold: goto 2.
6. Skill: invoke `npx tsx scripts/seed-crystallize.ts`
   - Script shells out to `claude -p` with the full transcript and a
     "render this as a seed.yaml" prompt template, asking for structured
     JSON.
   - Script validates JSON against the seed zod schema.
   - On valid: writes .clarify/seed.yaml + transcript snapshot.
   - On invalid: returns errors; skill asks Claude to fix the response.
7. Skill: print the seed back to the user for review.
   "Approve to proceed to `clarify run`?"
```

### 6.2 `clarify run`

**Goal:** execute the seed's AC tree.

```
1. Skill: invoke `npx tsx scripts/run-init.ts`
   - Loads seed.yaml, validates, sets phase='executing'.
   - Marks all leaf ACs 'pending'.
2. Skill: walk leaves in declared order.
   For each leaf AC:
   a. Skill (Claude in-session): given the AC + allowed_paths +
      current code state, write/modify the code to satisfy the AC.
      Claude uses its native Edit/Write tools — clarify does NOT
      reimplement code generation.
   b. Skill: invoke `npx tsx scripts/run-mark-progress.ts --ac AC-X --status in_progress`.
   c. (Code changes happen in user's working tree.)
   d. Skill: invoke `clarify evaluate --ac AC-X` (chains to 6.3).
3. Skill: invoke `npx tsx scripts/run-finalize.ts` to roll up status
   and set phase='done' if all passed, otherwise 'evolving'.
```

### 6.3 `clarify evaluate [--ac AC-X | --all]`

**Goal:** run the 3-stage pipeline against one or all ACs.

```
For each target AC:
  Stage 1 — Mechanical
    Script: scripts/eval-mechanical.ts
    For each command in seed.mechanical_checks:
      execSync(cmd, { timeout: 5min })
      record exit code → pass/fail
    If any fail → AC fails; skip to consensus.

  Stage 2 — LLM review
    Script: scripts/eval-llm.ts
    Build prompt:
      - AC id, title, intent
      - allowed_paths
      - git diff filtered to allowed_paths
      - mechanical results
    Shell out: `claude -p "<prompt requesting JSON {score, verdict, notes}>"`
    Parse JSON, validate via zod.

  Stage 3 — Consensus
    Script: scripts/eval-consensus.ts
    Pass iff: mechanical.all_pass AND llm.score >= thresholds.consensus_min
    Write evaluation entry to state.json.
```

### 6.4 `clarify evolve`

**Goal:** when ACs failed, refine the seed and try again.

```
1. Skill: invoke `npx tsx scripts/evolve-analyze.ts`
   - Collects failed evaluations from state.json.
   - Shells out: `claude -p` with failed-AC details + LLM-review notes,
     asking: "What's wrong — under-specification, contradiction, or
     genuine implementation bug? Output structured JSON."
2. If under-specification or contradiction:
   - Skill asks user 1–3 targeted clarifying questions
     (mini-interview).
   - Script: scripts/evolve-rewrite-seed.ts produces seed v(n+1)
     under .clarify/evolutions/<n>.yaml with parent_seed link.
   - state.json's seed_id updates to the new seed.
3. If implementation bug:
   - Skill (Claude in-session) attempts a fix in the codebase
     for the failed AC, no seed rewrite.
4. Skill triggers `clarify evaluate` for the affected ACs.
5. Loop until all ACs pass OR `max_evolutions` (default: 3) hit.
```

### 6.5 `clarify status [--deep]`

**Goal:** report current phase, AC progress, drift.

```
Script: scripts/status.ts
1. Load state.json.
2. Compute scope-drift:
   - git diff --name-only HEAD~1 (or since session start)
   - For each modified file: does any AC's allowed_paths cover it?
   - rogue_files = files matched by no AC.
   - scope_score = |rogue_files| / |modified_files|
3. If --deep:
   - Shell out: `claude -p` with seed + recent diff →
     "Score 0–1 how much current code drifts from intent. Narrative."
   - intent_score from response.
4. Verdict:
   - aligned   if max(scope, intent) < drift_warn
   - drifting  if drift_warn <= max < drift_fail
   - diverged  if max >= drift_fail
5. Print human-readable report; write drift block into state.json.
```

---

## 7. Inventory

### 7.1 Skills (Markdown — what Claude reads)

| Skill dir | Trigger | Purpose |
|---|---|---|
| `skills/interview/SKILL.md` | `clarify interview "<idea>"` | Run Socratic Q&A, write seed |
| `skills/run/SKILL.md` | `clarify run` | Execute seed's AC tree |
| `skills/evaluate/SKILL.md` | `clarify evaluate [--ac]` | 3-stage eval pipeline |
| `skills/evolve/SKILL.md` | `clarify evolve` | Refine seed on failure, retry |
| `skills/status/SKILL.md` | `clarify status [--deep]` | Drift + AC progress report |
| `skills/help/SKILL.md` | `clarify help` | Print available commands |

### 7.2 Scripts (TypeScript — deterministic logic)

| Script | Inputs | Outputs | LLM? |
|---|---|---|---|
| `scripts/interview-record.ts` | `--q --a` | updated state.json, ambiguity_score | No |
| `scripts/seed-crystallize.ts` | (state.json) | `.clarify/seed.yaml` | Yes (`claude -p`) |
| `scripts/run-init.ts` | (seed.yaml) | state.json (phase=executing) | No |
| `scripts/run-mark-progress.ts` | `--ac --status` | updated state.json | No |
| `scripts/run-finalize.ts` | (state.json) | rolled-up status | No |
| `scripts/eval-mechanical.ts` | `--ac` | per-check exit codes in state.json | No |
| `scripts/eval-llm.ts` | `--ac` | LLM verdict in state.json | Yes (`claude -p`) |
| `scripts/eval-consensus.ts` | `--ac` | consensus pass/fail in state.json | No |
| `scripts/evolve-analyze.ts` | (state.json) | structured failure analysis | Yes (`claude -p`) |
| `scripts/evolve-rewrite-seed.ts` | (analysis) | `.clarify/evolutions/<n>.yaml` | Yes (`claude -p`) |
| `scripts/status.ts` | `[--deep]` | drift report (printed + persisted) | Optional (`claude -p` if `--deep`) |
| `scripts/state.ts` | various read-only queries | JSON to stdout | No |

Scripts share helpers in `src/lib/`:
- `src/lib/state.ts` — load/save state.json with schema validation
- `src/lib/seed.ts` — load/save seed.yaml with zod validation
- `src/lib/claude.ts` — wrap `execSync('claude -p ...')` with timeout, JSON-mode prompt template, output parsing
- `src/lib/git.ts` — `git diff --name-only`, blame-light helpers
- `src/lib/ac.ts` — tree walking, status roll-up, path matching

---

## 8. Project Layout

```
clarify/
├── README.md
├── SPEC.md                      # this file
├── LICENSE                      # MIT
├── package.json
├── tsconfig.json
├── .gitignore
├── .claude-plugin/
│   └── plugin.json              # Claude Code plugin manifest
├── skills/
│   ├── interview/SKILL.md
│   ├── run/SKILL.md
│   ├── evaluate/SKILL.md
│   ├── evolve/SKILL.md
│   ├── status/SKILL.md
│   └── help/SKILL.md
├── scripts/                     # Entry points (one per workflow step)
│   ├── interview-record.ts
│   ├── seed-crystallize.ts
│   ├── run-init.ts
│   ├── run-mark-progress.ts
│   ├── run-finalize.ts
│   ├── eval-mechanical.ts
│   ├── eval-llm.ts
│   ├── eval-consensus.ts
│   ├── evolve-analyze.ts
│   ├── evolve-rewrite-seed.ts
│   ├── status.ts
│   └── state.ts
├── src/
│   ├── lib/
│   │   ├── state.ts
│   │   ├── seed.ts
│   │   ├── claude.ts
│   │   ├── git.ts
│   │   └── ac.ts
│   ├── schema/
│   │   ├── seed.ts              # zod schema for seed.yaml
│   │   └── state.ts             # zod schema for state.json
│   ├── backends/
│   │   ├── types.ts
│   │   └── claude.ts
│   └── prompts/
│       ├── crystallize.md       # template for seed-crystallize
│       ├── llm-review.md        # template for eval-llm
│       ├── analyze-failure.md   # template for evolve-analyze
│       ├── rewrite-seed.md      # template for evolve-rewrite-seed
│       └── intent-drift.md      # template for status --deep
├── tests/
│   ├── unit/                    # vitest unit tests for lib/, schema/
│   └── fixtures/                # sample seeds, transcripts, state files
└── docs/
    ├── architecture.md          # condensed version of SPEC §4–§5 for users
    ├── seed-reference.md        # seed YAML field-by-field reference
    └── recipes.md               # canned examples (todo app, REST API, etc.)
```

### 8.1 `.claude-plugin/plugin.json`

```json
{
  "name": "clarify",
  "version": "0.1.0",
  "description": "Specification-first AI coding workflow as a Claude Code plugin.",
  "author": "Ashok Naik",
  "license": "MIT",
  "skills": [
    "skills/interview",
    "skills/run",
    "skills/evaluate",
    "skills/evolve",
    "skills/status",
    "skills/help"
  ],
  "requires": { "node": ">=20" }
}
```

---

## 9. Dependencies (deliberately minimal)

**Runtime:**
- `yaml` (~20kb) — seed.yaml parsing
- `zod` — schema validation for seed and state
- `tsx` — TypeScript execution (dev + runtime)

**Dev:**
- `typescript`
- `vitest` — unit tests
- `@types/node`

**Not used:**
- ❌ `@anthropic-ai/sdk` — we use `claude -p` instead
- ❌ `commander` / `yargs` — scripts use `process.argv` parsing in <10 lines
- ❌ `chalk` / `ora` / TUI libs — Claude renders output
- ❌ Database driver — single JSON state file
- ❌ MCP SDK — no MCP server in v1

Total target: **<5 production deps, <500kb installed**.

---

## 10. Build & Dev Workflow

```bash
# Local dev (no compile step)
npm install
npx tsx scripts/interview-record.ts --q "test" --a "test"

# Tests
npm test          # vitest

# Production build
npm run build     # tsc → dist/  (skills can invoke node dist/scripts/*.js for cold-start speed)
```

The plugin is **shipped uncompiled**: skills invoke `npx tsx scripts/*.ts` directly. Trade-off is ~300ms tsx startup per script call vs zero install-time complexity. Acceptable given each skill makes only a handful of script calls per command.

---

## 11. Testing Strategy

- **Unit tests (vitest)** — every helper in `src/lib/` and every zod schema. No mocks for filesystem; use `tmp` directories with real I/O.
- **Script smoke tests** — each `scripts/*.ts` has a test that exercises it end-to-end against a fixture `state.json`. `claude -p` calls are mocked at the `lib/claude.ts` boundary.
- **No integration test against real Claude Code in v1** — validated manually via the recipes in `docs/recipes.md`.

Coverage target: **80% lines on `src/lib/` and `src/schema/`.** Scripts get smoke tests, not coverage targets.

---

## 12. Roadmap

| Stage | Scope | When |
|---|---|---|
| **v0.1** (this spec) | All 5 features, Claude-only, manual recipes for validation | After spec approval |
| v0.2 | Codex backend impl behind `Backend` interface | When user requests |
| v0.3 | MCP server adapter (so the same scripts can be exposed as MCP tools) | If/when needed |
| v0.4 | Cost tracker + parallel AC execution | If perf becomes a pain point |
| v1.0 | Stability promise + plugin marketplace listing | After v0.x bake-in |

---

## 13. Open Questions / Known Limitations

1. **`claude -p` JSON-mode reliability.** We rely on `claude -p` returning structured JSON when prompted to. If the response is malformed, we retry once with a stricter prompt and fail loudly. May need fallback parsing heuristics.
2. **Long-running mechanical checks.** Tests that take >5 min will time out the eval stage. Threshold is configurable in seed; documenting recommended caps.
3. **AC↔file mapping precision.** `allowed_paths` is glob-based — the user must keep it accurate or scope-drift fires false positives. Interview phase explicitly asks the user to declare paths.
4. **Concurrent runs.** v1 assumes one `clarify run` per project at a time. No locking yet — acceptable since it's developer-driven.
5. **Repo-relative paths.** All paths in seed are relative to the project root (where `.clarify/` lives). Multi-package monorepos work but the user picks one package to be "the project".

---

## 14. Acceptance Criteria for THIS spec

This spec is itself a seed. It's "approved" when the reader can answer **yes** to all of:

- [ ] I can describe in one sentence what `clarify` does
- [ ] I know which 5 features ship in v1 and which Ouroboros features were intentionally cut
- [ ] I can describe the runtime model (skills + tsx scripts + `claude -p`) without re-reading
- [ ] I understand why there is no `@anthropic-ai/sdk` dependency
- [ ] I can name the data files (`seed.yaml`, `state.json`) and what each holds
- [ ] I can describe the 3-stage eval pipeline and the drift detection split (scope vs intent)
- [ ] I see a clear v0.1 build path and it does not require building a TUI, MCP server, or SQLite store

If any are "no", either the spec needs editing or the design needs another grill-me round.

---

**End of spec. Approve to proceed to implementation.**
