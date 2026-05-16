---
name: clarify-goal
description: "Use when the user says `clarify goal`, `/clarify-goal`, or asks clarify to drive the seed forward toward a single concrete goal one AC at a time, with a user checkpoint between each. Peer to `clarify ralph` — supervised vs. ralph's unattended grind."
---

# clarify goal "<one-line goal>" [flags]

Supervised, goal-narrowed execution of the AC tree. Where `clarify ralph` attacks every failing AC each iteration and evolves the seed on stagnation, `clarify goal` attacks **one** AC per iteration — the one most aligned with the user's stated goal — and checkpoints with the user between each. It never auto-evolves: if an AC fails twice, it surfaces to the user.

Use this when:
- You have time-boxed attention and want to ship a slice (e.g. "the auth flow", "the read-only API surface") rather than the whole seed.
- You want explicit user approval on AC selection and approach before each implementation step.
- You suspect some ACs in the seed are out of scope for your current sub-goal and want to skip them rather than evolve the seed.

## Flags (all optional)

- `--goal "<text>"` — the goal statement. If omitted, the skill asks the user for one via `AskUserQuestion`.
- `--max-iterations N` — hard cap (default 10, max 50).
- `--per-iteration-timeout-ms N` — wall-clock cap per iteration (default 1_800_000 = 30 min).
- `--total-timeout-ms N` — wall-clock cap across the whole run (default 7_200_000 = 2 h).
- `--alignment-min F` — `[0,1]` threshold below which ACs are treated as "not goal-aligned" (default 0.5).

## Pre-flight

Refuse to start if `.clarify/seed.yaml` is missing — tell the user to run `clarify interview "<idea>"` or `clarify ingest <ticket>` first.

If `state.ac_status` is empty (no `clarify run` or `clarify ralph` has touched the seed yet), run the run-init script once to seed pending statuses:

```bash
$( [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && echo "$CLAUDE_PLUGIN_ROOT" || find "$HOME/.claude/plugins/cache/clarify/clarify" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V | tail -1 | grep . || echo .)/bin/clarify-run.sh run-init.ts
```

## Step 1 — collect the goal statement

If `--goal` was supplied on the command line, use it verbatim. Otherwise, show the user the seed's `description` and ask:

```json
{
  "questions": [{
    "question": "What's the concrete goal you want `clarify goal` to drive toward? Keep it to one sentence. Example: 'ship the JWT login flow end-to-end' or 'wire up the read-only items API'.",
    "header": "Goal",
    "options": [
      {"label": "<seed.description verbatim>", "description": "Use the seed's overall description as the goal."},
      {"label": "Let me type a sub-goal", "description": "Narrow to a specific slice. You'll write it freeform."}
    ],
    "multiSelect": false
  }]
}
```

If the user picks "Let me type a sub-goal", get the free-form text and treat THAT as the goal.

## Step 2 — initialize goal state

```bash
$( [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && echo "$CLAUDE_PLUGIN_ROOT" || find "$HOME/.claude/plugins/cache/clarify/clarify" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V | tail -1 | grep . || echo .)/bin/clarify-run.sh goal-init.ts \
  --goal "<the goal statement>" \
  [--max-iterations N] [--per-iteration-timeout-ms N] \
  [--total-timeout-ms N] [--alignment-min F]
```

If `state.goal` was already `running` from a previous invocation, this script archives the previous statement into `state.goal.history[]` and replaces the current statement — iterations continue uninterrupted. Capture the printed `config` and `started_at`.

## Step 3 — the iteration loop

Repeat until `terminate=true`:

### 3a. Rank pending ACs against the goal

```bash
$( [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && echo "$CLAUDE_PLUGIN_ROOT" || find "$HOME/.claude/plugins/cache/clarify/clarify" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V | tail -1 | grep . || echo .)/bin/clarify-run.sh goal-select-ac.ts > /tmp/clarify-goal-selection.json
```

Read `top_ac_id`, `top_score`, `above_threshold[]`, and `summary` from the output.

- If `above_threshold` is empty (no AC scores ≥ `alignment_min`), record `action=no_aligned_ac` and ask the user whether to (a) lower the threshold, (b) supply a new goal, or (c) finalize. Then loop or finalize accordingly.
- Otherwise the top entry is the candidate AC. Proceed to 3b.

### 3b. User checkpoint: confirm the candidate

```json
{
  "questions": [{
    "question": "Next-up: <AC_ID> — <AC_TITLE> (alignment <top_score>).\n\nRationale: <ranked[0].rationale>\n\nGo ahead, or pick a different AC?",
    "header": "Next AC",
    "options": [
      {"label": "Implement <AC_ID>", "description": "Proceed with the recommended AC."},
      {"label": "Pick another AC", "description": "Show me the ranked list and let me choose."},
      {"label": "Change the goal", "description": "I want to redirect — capture a new goal statement."},
      {"label": "Stop here", "description": "Finalize the run."}
    ],
    "multiSelect": false
  }]
}
```

- **Implement <AC_ID>** → proceed to 3c.
- **Pick another AC** → show `ranked[]` (top 5 or so), let the user pick by id, then proceed to 3c with that id. Replace `selected_ac_id` and `alignment_score` accordingly.
- **Change the goal** → ask for the new goal via `AskUserQuestion` (free-form input), re-run `goal-init.ts --goal "<new>"` (this archives the previous statement into history with `reason=goal_changed`), record an iteration with `--action goal_changed`, and loop back to 3a.
- **Stop here** → break out of the loop, jump to Step 4 with `--reason abandoned`.

### 3c. Implement and evaluate the chosen AC

1. Mark in_progress:
   ```bash
   $( [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && echo "$CLAUDE_PLUGIN_ROOT" || find "$HOME/.claude/plugins/cache/clarify/clarify" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V | tail -1 | grep . || echo .)/bin/clarify-run.sh run-mark-progress.ts --ac AC-X --status in_progress
   ```

2. **Implement the AC.** Read its `title`, `intent`, `allowed_paths` from the seed. Use your native Edit/Write tools. Do NOT touch files outside `allowed_paths` — that's a seed problem, not an implementation problem.

3. Evaluate (3-stage pipeline):
   ```bash
   $( [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && echo "$CLAUDE_PLUGIN_ROOT" || find "$HOME/.claude/plugins/cache/clarify/clarify" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V | tail -1 | grep . || echo .)/bin/clarify-run.sh eval-mechanical.ts --ac AC-X
   $( [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && echo "$CLAUDE_PLUGIN_ROOT" || find "$HOME/.claude/plugins/cache/clarify/clarify" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V | tail -1 | grep . || echo .)/bin/clarify-run.sh eval-llm.ts --ac AC-X
   $( [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && echo "$CLAUDE_PLUGIN_ROOT" || find "$HOME/.claude/plugins/cache/clarify/clarify" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V | tail -1 | grep . || echo .)/bin/clarify-run.sh eval-consensus.ts --ac AC-X
   ```

4. **One retry on fail.** If consensus is `fail` after the first attempt, do ONE retry of the implementation step, then re-evaluate. Track that you retried so the iteration record can carry `--retried`.

5. After (the retry if any), the AC is either `passed` or `failed`. Do NOT auto-evolve — failures surface to the user at the next checkpoint.

### 3d. Record the iteration

```bash
$( [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && echo "$CLAUDE_PLUGIN_ROOT" || find "$HOME/.claude/plugins/cache/clarify/clarify" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V | tail -1 | grep . || echo .)/bin/clarify-run.sh goal-step.ts \
  --action <implemented_passed|implemented_failed|user_skipped|goal_changed|no_aligned_ac|iteration_timeout> \
  --duration-ms <ms> \
  [--ac AC-X] [--alignment-score 0.83] [--verdict pass|fail] [--retried] \
  [--notes "<short summary>"]
```

The script appends a `GoalIteration` and prints `{terminate, reason}`. If iteration timeout fires, pass `--action iteration_timeout` instead and skip the AC-level fields.

### 3e. Honor termination

- If `terminate=true`, jump to Step 4 with no `--reason` (the finalize script will derive it from `reason` automatically).
- Else, post-iteration checkpoint:

```json
{
  "questions": [{
    "question": "AC-X just <passed|failed (retried once)>. <progress.passed>/<total_leaves> ACs done, <progress.pending> pending, <progress.failed> failed.\n\nGoal: \"<state.goal.statement>\"\n\nContinue toward this goal?",
    "header": "Continue?",
    "options": [
      {"label": "Continue", "description": "Pick the next goal-aligned AC and keep going."},
      {"label": "Change the goal", "description": "Redirect to a new sub-goal; previous statement archived into history."},
      {"label": "Stop here", "description": "Finalize the run."}
    ],
    "multiSelect": false
  }]
}
```

- **Continue** → loop to 3a.
- **Change the goal** → as in 3b: free-form new goal, re-run `goal-init.ts`, record `--action goal_changed`, loop to 3a.
- **Stop here** → break out, finalize with `--reason abandoned`.

### Wall-clock caps

All shells in one iteration must run inside the per-iteration cap. If it fires, record `--action iteration_timeout`. The total-timeout fires via `shouldTerminate` automatically on the next `goal-step.ts` call.

## Step 4 — finalize

```bash
$( [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && echo "$CLAUDE_PLUGIN_ROOT" || find "$HOME/.claude/plugins/cache/clarify/clarify" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V | tail -1 | grep . || echo .)/bin/clarify-run.sh goal-finalize.ts [--reason abandoned]
```

This seals `state.goal.status` + `stop_reason` and updates `state.phase`. Print a one-line summary:

- `Goal achieved in N iterations: "<statement>".`
- `Goal exhausted (N iterations) — pending: ..., failed: ....`
- `Goal abandoned by user after N iterations — last AC: ....`
- `Goal: no_aligned_acs — nothing pending scored ≥ alignment_min. Consider a new goal or `clarify evolve`.`
- `Goal: total_timeout after N iterations (ran X minutes).`

If any AC ended `failed`, suggest the user run `clarify evolve` on that AC. If they want to resume the goal loop later, `clarify goal --goal "<same statement>"` picks up where it left off (history continuous).

## What `clarify goal` never does

- Auto-evolve the seed. Failures surface to the user, not to `evolve-rewrite-seed.ts`.
- Attack more than one AC per iteration.
- Re-prompt Claude through `claude -p` for code edits — the active session does the work. The only `claude -p` call is in `goal-select-ac.ts` (alignment scoring).
- Skip the user checkpoint. Even when the alignment score is unambiguous, the user gets a "go / pick another / change goal / stop" prompt before implementation.
