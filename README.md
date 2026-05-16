# clarify

> A Claude Code plugin that forces a written specification — with a checkable acceptance-criteria tree — in front of every coding task.
> TypeScript. Slim. Zero API keys.

**Turn a vague idea into a verified, working codebase.**

`clarify` is a local-first runtime layer that turns non-deterministic agent work into a replayable, observable, policy-bound execution contract. It replaces ad-hoc prompting with a structured specification-first workflow: **interview → crystallize → execute → evaluate → evolve.** Today on Claude Code; the backend abstraction is pluggable so Codex CLI, OpenCode, and other runtimes can slot in behind the same surface later.

---

## The failure mode this exists to prevent

You describe a feature in 1–2 sentences. The agent returns code that compiles, the tests it wrote itself pass, and the feature still isn't what you asked for. You spot it in review (best case) or in production (worst case). You re-prompt. Two more rounds. You eventually ship something close to the original ask, having burned an afternoon.

The bug isn't the model. The bug is that **"build me a todo CLI"** is six unanswered questions in a trench coat — single user vs. multi-user, file vs. sqlite, sync vs. async, what `done` looks like, what's out of scope, what mustn't break. The agent guesses; the guesses don't always match. There's no contract to point at when the answer drifts.

`clarify` makes the contract explicit, machine-checkable, and impossible to skip.

Works **greenfield** (interview a vague idea into a seed) and **brownfield** (consume a ticket plus your existing codebase, infer mechanical checks from your manifests, and constrain edits via per-AC `allowed_paths`).

## What it actually does

Five steps, in order, every time:

1. **Interview.** A Socratic loop drives ambiguity below a threshold by asking one targeted question per turn (language, runtime, persistence, scope, success criteria, constraints). It stops when there's nothing important left to guess.
2. **Seed.** The transcript is crystallized into an immutable `seed.yaml` containing a hierarchical acceptance-criteria (AC) tree. Each leaf AC has a `title`, an `intent`, and `allowed_paths` — a glob list saying which files this AC is allowed to touch.
3. **Execute.** Claude implements each leaf AC using its native edit tools. Writing outside `allowed_paths` is treated as a seed problem, not an implementation problem — execution stops and surfaces the conflict.
4. **Evaluate.** Three stages, per AC: (a) **mechanical** — every shell command in `mechanical_checks` runs; non-zero exit fails the stage; (b) **LLM review** — `claude -p` is shown the AC plus the diff scoped to `allowed_paths` and returns `{score, verdict, notes}`; (c) **consensus** — pass iff mechanical-all-pass *and* `llm.score ≥ consensus_min` (default 0.8).
5. **Evolve.** On persistent failure, a separate analyzer call categorizes the failure as `under_specification`, `contradiction`, or `implementation_bug`. The first two rewrite the seed (after one or two clarifying questions to you); the third edits the code. Hard-capped at `max_evolutions` (default 3).

Two ambient signals run alongside execution:

- **Scope drift (cheap):** fraction of git-modified files not covered by any AC's `allowed_paths`.
- **Intent drift (`status --deep` only):** an LLM call that semantically scores how far the diff has wandered from the seed's stated intent.

Both feed a single verdict — `aligned`, `drifting`, `diverged` — against thresholds that live in the seed.

## Why this beats the obvious alternatives

**"I'll just write a Markdown brief and paste it into the prompt."** A brief has no enforcement. Nothing checks that the produced code corresponds to the brief — only that it parses and runs. clarify's AC tree gives the evaluator a concrete unit to score *each leaf* against, with the diff filtered to that leaf's allowed paths. The brief becomes a tree the implementer commits to and the evaluator scores against.

**"I'll prompt iteratively until it's right."** That works for small tasks. It fails at the boundary where you forget what the original ask was three turns in. The seed is immutable for the duration of one cycle; if it's wrong, evolution rewrites it explicitly under a versioned filename, with a parent pointer. There's an audit trail.

**"I'll use a heavyweight planning agent."** clarify deliberately doesn't ship a TUI, an MCP server, an event-sourced store, or multiple-backend adapters (see SPEC §2.1 for the full out-of-scope list). It's six skill files, twelve scripts, two YAML/JSON state files. You can read the entire source in an afternoon.

## What it doesn't help with

Be honest about scope. Don't reach for clarify when:

- The task is **a one-line bug fix or a five-line refactor.** The interview overhead won't pay for itself.
- You're **exploring** — sketching, prototyping, learning a library. Specifications are the wrong shape for "I don't know yet what I want."
- The work is **purely creative** (UI polish, copywriting, design choices) where "intent" can't be reduced to file-scoped acceptance criteria.

For everything else — features with shape, refactors with stated invariants, integrations with named contracts — the spec phase pays back the time it costs.

## What it costs

Per cycle, roughly:

- Interview: 3–8 turns. ~30 seconds of your attention each.
- Crystallize: one `claude -p` call.
- Per AC evaluation: one `claude -p` call (LLM review). Mechanical checks take whatever your test suite takes.
- Optional intent-drift: one extra `claude -p` call when you run `clarify status --deep`.

Authentication piggybacks on your existing Claude Code session. There is no separate `ANTHROPIC_API_KEY`, no account to provision. Cost lives in your existing subscription.

---

## Install

```bash
claude plugin marketplace add AshokNaik009/clarify
claude plugin install clarify@clarify
```

## Quickstart

Inside a Claude Code session, in the project you're working on:

```text
clarify interview "a tiny todo CLI in TypeScript that persists to a JSON file"
```

Claude asks one question at a time until ambiguity drops below threshold, then writes `.clarify/seed.yaml`. Approve the seed, then:

```text
clarify run            # implement each AC, evaluate as you go
clarify status         # AC progress + cheap scope-drift check
clarify status --deep  # add an LLM intent-drift narrative
clarify evolve         # only if any AC failed: diagnose + refine + retry
```

That's the whole loop.

## Commands

| Command | What it does |
|---|---|
| `clarify interview "<idea>"` | Socratic Q&A → writes `.clarify/seed.yaml`. Brownfield-aware. |
| `clarify scan` | Snapshot manifests + structured codebase summary into `state.scan`. |
| `clarify ingest <ticket>` | Brownfield-native: ticket + scan → up to 5 gap questions → `seed.yaml`. |
| `clarify detect` | Author `seed.mechanical_checks` from project manifests via one LLM call. |
| `clarify run` | Execute the seed's acceptance-criteria tree. |
| `clarify evaluate [--ac AC-X \| --all]` | 3-stage pipeline: mechanical → LLM review → consensus. |
| `clarify evolve` | Refine seed on failure or fix the code; retry. |
| `clarify ralph [flags]` | Drive evaluate→evolve in a bounded loop until converged or capped. |
| `clarify goal "<goal>" [flags]` | Supervised peer to ralph: one goal-aligned AC per iteration, user checkpoint between each. |
| `clarify unstuck [persona]` | Reframe a stuck AC through a lateral-thinking persona. |
| `clarify status [--deep]` | Drift detection: scope (cheap) + intent (LLM, opt-in). |
| `clarify help` | Print the available commands. |

### Brownfield mode

When you're working on an existing repo, skip the long Socratic loop and feed `clarify` a ticket plus a snapshot of what already exists:

```text
clarify scan                              # → .clarify/state.json :: scan summary + tech stack
clarify ingest jira-AUTH-1234.md          # → drafts seed, asks ≤5 gap questions, writes seed.yaml
clarify detect                            # → seed.mechanical_checks filled from your package.json/etc.
clarify ralph --max-iterations 5          # run evaluate→evolve until converged or capped
```

`clarify ingest` runs in **two phases**, mirroring how ouroboros does PM-driven interviews:

1. **Phase 1 — draft + gaps.** One `claude -p` call against the `seed-architect` persona produces a draft seed AND a list of high-impact decisions the ticket left open (e.g. "enforce or only suggest no-new-deps?", "is the webhook handler `src/api/webhooks/` or `src/services/billing/webhooks/`?"). Hard-capped at 5 questions.
2. **Phase 2 — bridging interview + finalize.** The skill walks the gaps via `AskUserQuestion`. The user can answer or pick "Decide later" per gap. Their answers are folded back into a second `seed-architect` call that writes the final `.clarify/seed.yaml`. Anything deferred lands in `seed.brownfield.unresolved_gaps[]` so the LLM-review stage sees it on every AC review later.

If the ticket is fully unambiguous (`gaps: []`), Phase 2 is skipped and the seed is written immediately. Pass `--no-bridge` to force one-shot mode regardless. Anything beyond the 5-question cap also lands in `unresolved_gaps[]`.

The brownfield-aware interview (`clarify interview`) is the fallback for when the ticket is informal or absent: it auto-confirms manifest-known facts (language, package manager, framework versions) instead of asking the user, and the **Dialectic Rhythm Guard** still routes every fourth question to the user so you don't lose the plot. Greenfield users see no change unless they invoke the new commands.

### When to use Ralph, Goal, and Unstuck

Post-seed, you fork into three execution modes. Pick the one that matches your attention budget:

- **`clarify run`** — manual, every AC in declared order, evaluate after each. Best when you want full control and to watch every step.
- **`clarify ralph`** — unattended. Loops `evaluate` → `evolve` over **every** failing AC each iteration; auto-evolves the seed on diagnosed failures; auto-invokes `unstuck` once on stagnation. Best for a CI job, an idle queue, or "let it cook" runs. Honest hard caps (default 10 iterations, 30 min per iteration, 2 h total) so it can't run away.
- **`clarify goal "<goal>"`** — supervised peer to ralph. Picks the **one** AC most aligned with your stated goal each iteration, checkpoints with you before implementation (`implement / pick another / change goal / stop`), checkpoints again after evaluation, never auto-evolves (failures surface back to you). Best for time-boxed slices — "ship the auth flow", "wire the read-only API" — where you want to skip ACs that aren't on the goal path rather than evolve the seed around them.

`clarify unstuck` is the escalation hatch for `ralph`: when Ralph would otherwise terminate as `stagnated`, it auto-invokes one persona for a single reframing attempt before giving up. You can also invoke `clarify unstuck` manually at any time when you want a deliberate change of lens — `contrarian` to challenge an assumption, `simplifier` to cut scope, and so on.

## How it flows (visual)

Four diagrams. Each one is a complete picture of one part of the loop — read the one that matches what you're trying to do.

### 1. Greenfield: vague idea → verified code

```
   "build me a thing"
            │
            ▼
   ┌────────────────┐         one Q at a time, ambiguity-driven
   │   interview    │   ─────────────────────────────────────────▶  user
   │  (Socratic)    │   ◀─────────────────────────────────────────  user
   └────────────────┘         until ambiguity_score ≤ 0.2
            │
            ▼   crystallize (claude -p)
   ┌────────────────┐
   │   seed.yaml    │   immutable contract:
   │                │     • description
   │                │     • acceptance_criteria (AC tree, recursive)
   │                │     • each leaf has allowed_paths globs
   │                │     • mechanical_checks
   │                │     • thresholds  (ambiguity, consensus, drift)
   └────────────────┘
            │
            ▼   walk leaf ACs in declared order
   ┌────────────────┐
   │      run       │   for each leaf:
   │                │     1. Claude writes code (Edit/Write,
   │                │        scoped by allowed_paths)
   │                │     2. clarify evaluate --ac AC-X
   └────────────────┘
            │
            ▼
   ┌────────────────┐
   │    evaluate    │   3-stage pipeline (see §3 below)
   └────────────────┘
            │
       ┌────┴────┐
       │         │
     pass      fail
       │         │
       │         ▼
       │  ┌────────────────┐
       │  │     evolve     │   diagnose + fix; loop back to evaluate
       │  └────────────────┘   (capped at thresholds.max_evolutions)
       │         │
       └─────────┘
            │
            ▼
        all pass  →  phase=done
```

### 2. Brownfield: ticket → seed (two-phase ingest)

```
                     ┌────────────────┐
                     │ clarify scan   │   one-shot codebase summary
                     └────────────────┘   ─▶ state.scan
                            │                (tech_stack, patterns, manifests)
                            ▼
   ticket.md ──┐    ┌────────────────────────┐
               ├──▶│  ingest  (Phase 1)      │   one claude -p
   state.scan ─┘    │  MODE=draft             │   ──▶ { draft_seed, gaps[≤5] }
                    └────────────────────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
             gaps == [ ]             gaps != [ ]
            (or --no-bridge)               │
                │                          ▼
                │              ┌─────────────────────────┐
                │              │  bridging interview     │
                │              │  (skill, ≤5 questions)  │
                │              │                         │
                │              │  per gap:               │
                │              │    AskUserQuestion {    │
                │              │      "<gap.question>"   │
                │              │      • <option-1>       │
                │              │      • <option-2>       │
                │              │      • Decide later     │
                │              │    }                    │
                │              └─────────────────────────┘
                │                          │
                │                          ▼
                │              ┌─────────────────────────┐
                │              │  ingest  (Phase 2)      │   one claude -p
                │              │  MODE=finalize          │   ──▶ final seed
                │              │  + answers folded in    │
                │              └─────────────────────────┘
                │                          │
                └─────────────┬────────────┘
                              ▼
                     ┌────────────────┐
                     │  seed.yaml     │   • brownfield.project_type
                     │                │   • brownfield.unresolved_gaps[]
                     │                │     (deferrals + 5-cap overflow)
                     │                │   • lineage.ticket_ref
                     └────────────────┘
                              │
                              ▼
                       clarify detect  →  clarify run  /  clarify ralph
```

### 3. Per-AC evaluation: the 3-stage pipeline

```
       ┌──────────────────────────┐
       │  AC-X (one leaf)         │
       │  • title, intent         │
       │  • allowed_paths         │
       └──────────────────────────┘
                  │
                  ▼
   ┌─────────────────────────────────┐
   │ Stage 1 — Mechanical            │   for each cmd in seed.mechanical_checks:
   │                                 │     execSync(cmd, timeout=5min)
   │   exit==0 ? pass : fail         │   any non-zero → AC fails; skip Stage 2
   └─────────────────────────────────┘
                  │
              all pass
                  │
                  ▼
   ┌─────────────────────────────────┐
   │ Stage 2 — LLM review            │   claude -p with:
   │                                 │     • AC + intent
   │   { score, verdict, notes }     │     • git diff filtered to allowed_paths
   │                                 │     • brownfield context (if present)
   │                                 │     • last 5 git log lines (brownfield)
   └─────────────────────────────────┘
                  │
                  ▼
   ┌─────────────────────────────────┐   pass iff:
   │ Stage 3 — Consensus             │     mechanical.all_pass
   │                                 │       AND
   │   pass / fail → state.json      │     llm.score ≥ thresholds.consensus_min
   └─────────────────────────────────┘     (default 0.8)
```

### 4. Brownfield interview routing + Dialectic Rhythm Guard

```
   MCP-free Socratic interview, brownfield-aware.

   ┌────────────────────────────────────────────────────────────┐
   │  next question (auto-picked from unfilled slots)            │
   └─────┬───────────────────────────────────────────────────────┘
         │
         │  Is the answer in a manifest, exact match, no judgment?
         ├──── yes ────▶ PATH 1a  auto-confirm, notify only           ┐
         │                                                            │
         │  Codebase suggests an answer (not exact)?                  │
         ├──── yes ────▶ PATH 1b  show finding + ask user "yes/no"    │ counter
         │                                                            │ ++
         │  External fact (API/library/pricing)?                      │
         ├──── yes ────▶ PATH 4   WebFetch + confirm with user        ┘
         │
         │  Pure judgment / scope / business / new-feature behavior?
         ├──── yes ────▶ PATH 2   ask user directly        counter := 0
         │
         │  Code fact + judgment ("X exists; should Y use it?")
         └──── yes ────▶ PATH 3   show + judgment to user  counter := 0


   ┌────────────────────────────────────────────────────────────┐
   │  Dialectic Rhythm Guard                                     │
   │                                                             │
   │  if counter ≥ 3                                             │
   │      next question MUST be PATH 2 (route to user)           │
   │  reset on every PATH 2 / PATH 3 turn                        │
   │                                                             │
   │  → keeps the dialectic with the human, not the codebase    │
   └────────────────────────────────────────────────────────────┘
```

## What lives on disk

```
.clarify/
├── seed.yaml                 # immutable contract for the current cycle
├── state.json                # live state: phase, AC status, evaluations, drift
├── transcripts/<ts>.md       # interview snapshots
└── evolutions/<n>.yaml       # one file per evolution iteration, with parent pointer
```

`.clarify/` is gitignored by default — it's per-machine runtime state. Commit `seed.yaml` separately if you want a shared, durable contract across the team.

## How it's built

Three layers, deliberately thin:

- **Skills** (`skills/*/SKILL.md`) — Markdown that Claude reads to decide what to do at each step.
- **Scripts** (`scripts/*.ts`, run via `npx tsx`) — deterministic plumbing. Read/write state, run mechanical checks, validate against zod schemas, parse YAML.
- **Headless LLM judgment** — when a script needs LLM thinking without your attention, it shells out to `claude -p "<prompt>"`. There is no `@anthropic-ai/sdk` dependency. The intelligence lives in skill prompts and `claude -p` calls; the scripts are pure plumbing.

A pluggable `Backend` interface (`src/backends/types.ts`) means non-Claude runtimes (Codex, OpenAI, local) can be added behind the same surface later. v1 ships `ClaudeBackend` only.

See [`docs/architecture.md`](./docs/architecture.md) for the design, [`docs/seed-reference.md`](./docs/seed-reference.md) for every seed field, [`docs/recipes.md`](./docs/recipes.md) for end-to-end smoke tests, and [`CHANGELOG.md`](./CHANGELOG.md) for what's new in each release.

## Local development

```bash
npm install
npm run typecheck
npm test
```

Smoke any script directly:

```bash
npx tsx scripts/interview-record.ts --q "lang/runtime?" --a "TypeScript on Node.js"
npx tsx scripts/state.ts --summary
```

Set `CLARIFY_FAKE_CLAUDE='{"score":0.9,"verdict":"pass","notes":"ok"}'` to short-circuit `claude -p` calls — useful for CI and unit tests without burning real model calls.

## Inspired by

[Q00/ouroboros](https://github.com/Q00/ouroboros) (Python). `clarify` is a deliberately-slim TypeScript port focused on the load-bearing features: interview, seed/AC tree, evaluation pipeline, evolution loop, drift detection, plus the Ralph meta-orchestrator and Unstuck escalation hatch added in 0.2 (see [`CHANGELOG.md`](./CHANGELOG.md)). The full out-of-scope list lives in [`SPEC.md` §2.1](./SPEC.md).

## License

MIT. See [`LICENSE`](./LICENSE).
