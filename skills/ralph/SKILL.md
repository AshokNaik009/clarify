---
name: clarify-ralph
description: Drive the eval→evolve loop to a terminal state with hard caps and a per-iteration timeout. The loop only stops on convergence, exhaustion, timeout, structured failure, or stagnation.
trigger: "clarify ralph"
---

# clarify ralph [flags]

Persistent loop over `clarify evaluate` and `clarify evolve` until the AC tree converges or a hard limit fires. **Use this when you want clarify to keep trying without manual intervention** — for an idle queue, a CI job, or an unsupervised "let it cook" session.

Ralph never invents new evaluation or evolution logic; it just chains the existing scripts and records each iteration's outcome on `state.ralph`.

## Flags (all optional)

- `--max-iterations N` — hard cap on iterations (default 10, max 50).
- `--per-iteration-timeout-ms N` — wall-clock cap per iteration (default 1_800_000 = 30 min).
- `--total-timeout-ms N` — wall-clock cap across the whole run (default 7_200_000 = 2 h).
- `--stuck-threshold N` — N consecutive `no_progress` iterations triggers stagnation handling (default 3).
- `--no-unstuck` — disable the auto-unstuck escalation. By default Ralph will run `clarify unstuck` once when it would otherwise stagnate.

## Pre-flight

Refuse to start if `.clarify/seed.yaml` is missing — tell the user to run `clarify interview "<idea>"` first.

## Step 1 — initialize Ralph

```bash
npx tsx ${CLAUDE_PLUGIN_DIR:-.}/scripts/ralph-init.ts \
  [--max-iterations N] [--per-iteration-timeout-ms N] \
  [--total-timeout-ms N] [--stuck-threshold N] [--no-unstuck]
```

Capture the printed `config` and `started_at`. Also run `clarify run` (or `scripts/run-init.ts`) once to seed `ac_status` if it's not already set up.

## Step 2 — the iteration

Repeat until `terminate=true`:

1. **Evaluate every failing or pending leaf AC.** For each leaf with status in `{pending, in_progress, failed}`:
   ```bash
   npx tsx ${CLAUDE_PLUGIN_DIR:-.}/scripts/eval-mechanical.ts --ac AC-X
   npx tsx ${CLAUDE_PLUGIN_DIR:-.}/scripts/eval-llm.ts --ac AC-X
   npx tsx ${CLAUDE_PLUGIN_DIR:-.}/scripts/eval-consensus.ts --ac AC-X
   ```

2. **Decide an action.** If all root ACs passed, jump to Step 3 — Ralph will record `evaluated` and terminate as `converged`.

   Otherwise run analysis:
   ```bash
   npx tsx ${CLAUDE_PLUGIN_DIR:-.}/scripts/evolve-analyze.ts > /tmp/clarify-analysis.json
   ```
   Branch on `analysis.category`:

   - `implementation_bug` → use your native Edit/Write tools to fix code, scoped to the affected ACs' `allowed_paths`. Re-evaluate just those ACs. Action = `fixed_implementation`.
   - `under_specification` or `contradiction` → ask the user `analysis.questions_for_user` (max 3), one at a time, save Q&A to `/tmp/clarify-clarifications.json`, then:
     ```bash
     npx tsx ${CLAUDE_PLUGIN_DIR:-.}/scripts/evolve-rewrite-seed.ts \
       --analysis /tmp/clarify-analysis.json \
       --clarifications /tmp/clarify-clarifications.json
     ```
     Action = `rewrote_seed`. Re-run `clarify run` to execute the new seed.

   If neither flipped any failed→passed AND no rewrite happened, action = `no_progress`.

3. **Record the iteration.** All shells in this iteration must run inside a hard wall-clock cap: pass `timeout` to `spawnSync`, or track elapsed milliseconds in-session. If the cap fires, pass `--action iteration_timeout`.
   ```bash
   npx tsx ${CLAUDE_PLUGIN_DIR:-.}/scripts/ralph-step.ts \
     --action <action> \
     --duration-ms <ms> \
     [--notes "<short summary>"]
   ```
   The script computes AC progress, appends a `RalphIteration`, and prints `{terminate, reason}`.

4. **Honor termination.**
   - If `terminate=false`, loop to Step 2.1.
   - If `reason=stagnated_pending_unstuck` AND `--no-unstuck` was NOT passed AND no prior unstuck attempt exists for this run, run the unstuck escalation (Step 2.5) then loop back to Step 2.1.
   - Otherwise jump to Step 3.

5. **(Stagnation only) unstuck escalation.** Ralph reads `analysis.category` from the most recent `/tmp/clarify-analysis.json`, then invokes `clarify unstuck` with that category and `--trigger ralph_stagnated`:
   ```bash
   npx tsx ${CLAUDE_PLUGIN_DIR:-.}/scripts/unstuck-record.ts \
     --trigger ralph_stagnated \
     --category <category> \
     --context "<last 3 iterations + failed AC ids>" \
     --suggestion "<the in-session reframing>"
   ```
   Then read `src/personas/<persona>.md` (the persona auto-picked from category) and apply its reframing in-session — typically by editing the seed or the affected code, scoped to the failing AC's `allowed_paths`. Add `--applied` if you actually changed files. Loop back to Step 2.1 for one final attempt.

## Step 3 — finalize

```bash
npx tsx ${CLAUDE_PLUGIN_DIR:-.}/scripts/ralph-finalize.ts
```

This seals `state.ralph.status` and `stop_reason`, and updates `state.phase`. Print a one-line summary:

- `Ralph: converged in N iterations.`
- `Ralph: exhausted (N iterations) — failed ACs: ...`
- `Ralph: stagnated_after_unstuck — manual review needed on: ...`
- `Ralph: total_timeout after N iterations (ran X minutes).`

## What Ralph never does

- Re-prompt Claude through `claude -p` for code edits — that's strictly worse than the active session doing it.
- Continue past `max_iterations`. The cap is honest.
- Skip unstuck and call it stagnated, unless `--no-unstuck` was explicitly passed.
