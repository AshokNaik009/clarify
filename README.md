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
| `clarify interview "<idea>"` | Socratic Q&A → writes `.clarify/seed.yaml`. |
| `clarify run` | Execute the seed's acceptance-criteria tree. |
| `clarify evaluate [--ac AC-X \| --all]` | 3-stage pipeline: mechanical → LLM review → consensus. |
| `clarify evolve` | Refine seed on failure or fix the code; retry. |
| `clarify status [--deep]` | Drift detection: scope (cheap) + intent (LLM, opt-in). |
| `clarify help` | Print the available commands. |

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

See [`docs/architecture.md`](./docs/architecture.md) for the design, [`docs/seed-reference.md`](./docs/seed-reference.md) for every seed field, and [`docs/recipes.md`](./docs/recipes.md) for end-to-end smoke tests.

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

[Q00/ouroboros](https://github.com/Q00/ouroboros) (Python). `clarify` is a deliberately-slim TypeScript port focused on the five most load-bearing features (interview, seed/AC tree, evaluation pipeline, evolution loop, drift detection). The full out-of-scope list lives in [`SPEC.md` §2.1](./SPEC.md).

## License

MIT. See [`LICENSE`](./LICENSE).
