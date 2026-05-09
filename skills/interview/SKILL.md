---
name: clarify-interview
description: "Use when the user says `clarify interview`, `/clarify-interview`, asks to start a Socratic interview, or wants to crystallize a vague idea into a seed.yaml. Drives ambiguity below threshold via one targeted question per turn. Brownfield-aware — auto-confirms manifest-known facts."
---

# clarify interview "<one-line idea>"

You drive a Socratic interview that ends with a written seed spec. Your job is to **drive ambiguity below `thresholds.ambiguity_max` (default 0.2)** by asking the user one question at a time. You — not the user — pick the questions.

## Step 0 — brownfield pre-flight (skip on greenfield)

Before turn 1, check whether the project has manifests (a `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, etc. at the project root). If yes — and there's no `.clarify/state.json` with a populated `scan` block already — run `clarify scan` first:

```bash
$( [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && echo "$CLAUDE_PLUGIN_ROOT" || find "$HOME/.claude/plugins/cache/clarify/clarify" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V | tail -1 | grep . || echo .)/bin/clarify-run.sh scan-codebase.ts
```

Read the resulting `state.scan.summary` and keep it in working memory for the rest of the interview. If the user has a structured ticket, suggest `clarify ingest` instead of the interview — `ingest` skips the Socratic loop entirely.

If there are no manifests (greenfield), skip Step 0 and proceed exactly as before — the rest of this skill works unchanged.

## Step 1 — initialize

If `.clarify/state.json` does not exist (or has no interview turns), ask the user to confirm their one-line idea and record it as the first turn:

```bash
$( [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && echo "$CLAUDE_PLUGIN_ROOT" || find "$HOME/.claude/plugins/cache/clarify/clarify" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V | tail -1 | grep . || echo .)/bin/clarify-run.sh interview-record.ts \
  --q "Initial idea" \
  --a "<the user's one-line idea verbatim>" \
  --idea "<the user's one-line idea verbatim>"
```

Read back the JSON output (notably `ambiguity_score` and `unfilled_slots`).

## Step 2 — ask one question at a time, with brownfield routing

For each question you generate, choose ONE of the paths below before sending it to the user. **Greenfield projects (no `state.scan`) only ever use PATH 2 — the rest is brownfield-only.**

### PATH 1a — Auto-confirm (high-confidence factual, no user block)

Use when ALL of these hold:
- The slot the question targets has an **exact-match** answer in a manifest (e.g. `package.json` `dependencies`, `pyproject.toml` `[tool.poetry]`, `go.mod` `module`/`go` line, `Dockerfile` `FROM`).
- The answer is **purely descriptive** — describes what already exists, not what the new feature should do.
- A single, unambiguous answer.

Then:
- Do NOT ask the user. Display a one-line notice: `ℹ️ Auto-confirmed: <slot> = <value> (<manifest>)`.
- Record the turn yourself with the `[from-code][auto-confirmed]` prefix:
  ```bash
  $( [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && echo "$CLAUDE_PLUGIN_ROOT" || find "$HOME/.claude/plugins/cache/clarify/clarify" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V | tail -1 | grep . || echo .)/bin/clarify-run.sh interview-record.ts \
    --q "<your question>" \
    --a "[from-code][auto-confirmed] <value> (<manifest>)"
  ```
- Increment the **dialectic counter** (see below).

Examples: language (from `package.json` `engines`), Python version (from `pyproject.toml`), package manager (from lockfile), framework (from top-level dep).

### PATH 1b — Code-confirmation (medium confidence)

Use when the codebase suggests an answer but it isn't a direct manifest match (e.g. JWT auth inferred from `src/auth/jwt.ts`).

Present BOTH the finding and a confirm/correct prompt to the user:

> "I see `src/auth/jwt.ts` — looks like JWT-based auth. Should the new feature reuse it? **Yes / No, let me correct**."

Record with `[from-code]` prefix when sending to `interview-record.ts`. Increment the dialectic counter.

### PATH 2 — Human judgment (default for greenfield, mandatory for decisions)

Use for goals, acceptance criteria, business logic, scope, success criteria, preferences, tradeoffs, NEW-feature behavior. The user is the only person who can answer these. Record with `[from-user]` prefix. **Resets the dialectic counter to 0.**

### PATH 3 — Code + judgment

When code contains a fact AND the question requires interpretation (e.g. "I see a Saga pattern in `services/orders/` — should `services/payments/` use it too?"), present the code finding and the judgment question together. Route the whole thing through `AskUserQuestion`. Record with `[from-user]`. **Resets the dialectic counter.**

### PATH 4 — Research interlude (rare)

For questions about external APIs, library capabilities, pricing, security advisories that aren't answerable from the local code, fetch the fact (WebFetch/WebSearch), present finding + confirm prompt to the user. Record with `[from-research]`. Increment the dialectic counter.

### Dialectic Rhythm Guard

Track consecutive non-user answers (PATH 1a + 1b + 4). If the counter reaches **3**, the next question MUST be PATH 2 — even if it looks code-answerable. Reset on every PATH 2 / PATH 3 turn. The interview is with the human, not the codebase.

The counter is a working-memory variable across the interview. If you lose it (session resume), reread the last 5 turns of `state.interview.turns` and recount the prefixes.

### Choosing which question to ask

Look at `unfilled_slots` (subset of: language, runtime, persistence, scope, success_criteria, constraints) and ask **one** targeted Socratic question that resolves the most load-bearing unfilled slot. Bad questions: open-ended, multi-part, anything you can derive from earlier answers or from manifests (those become PATH 1a auto-confirms).

Repeat until `ambiguity_score <= thresholds.ambiguity_max` (default 0.2). Hard cap: 8 turns. If ambiguity won't drop, surface the remaining unfilled slots verbatim and ask the user to volunteer answers.

## Step 3 — crystallize

Once ambiguity is below the threshold:

```bash
$( [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && echo "$CLAUDE_PLUGIN_ROOT" || find "$HOME/.claude/plugins/cache/clarify/clarify" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V | tail -1 | grep . || echo .)/bin/clarify-run.sh seed-crystallize.ts
```

This shells out to `claude -p` and writes `.clarify/seed.yaml`. Print the seed back to the user (read the file) and explicitly ask:

> "Approve this seed and proceed to `clarify run`? (yes/no/edit)"

If they say **edit**, ask what they want changed and re-run a 1–2 question mini-interview, then re-crystallize.

## Step 4 — output

End your response with a one-line summary: `seed_id`, number of ACs, location of the seed file. Do NOT proceed to `clarify run` automatically.

If the project is brownfield, suggest `clarify detect` next so `seed.mechanical_checks` gets filled before `clarify run`.
