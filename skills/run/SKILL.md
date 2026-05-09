---
name: clarify-run
description: "Use when the user says `clarify run`, `/clarify-run`, or asks clarify to execute the seed (implement each leaf AC, scoped by allowed_paths, evaluating after each)."
---

# clarify run

Execute the immutable seed in `.clarify/seed.yaml` against the working tree.

## Pre-flight

Refuse to start if any of:
- `.clarify/seed.yaml` is missing → tell the user to run `clarify interview "<idea>"` first.
- The interview transcript shows `interview.completed=false` in `state.json`.

## Step 1 — initialize the run

```bash
${CLAUDE_PLUGIN_ROOT:-.}/bin/clarify-run.sh run-init.ts
```

This sets `phase=executing`, marks every AC `pending`, and prints the leaf ACs in order. Capture that list.

## Step 2 — for each leaf AC, in declared order

For each leaf:

1. Mark in_progress:
   ```bash
   ${CLAUDE_PLUGIN_ROOT:-.}/bin/clarify-run.sh run-mark-progress.ts --ac AC-X --status in_progress
   ```

2. **Implement the AC.** Read the AC's `title`, `intent`, and `allowed_paths` from the seed. Use your native Edit/Write tools. **Do NOT touch files outside `allowed_paths`.** If the AC requires touching a path not in `allowed_paths`, stop and tell the user — that's a seed problem, not an implementation problem.

3. Evaluate it:
   ```bash
   ${CLAUDE_PLUGIN_ROOT:-.}/bin/clarify-run.sh eval-mechanical.ts --ac AC-X
   ${CLAUDE_PLUGIN_ROOT:-.}/bin/clarify-run.sh eval-llm.ts --ac AC-X
   ${CLAUDE_PLUGIN_ROOT:-.}/bin/clarify-run.sh eval-consensus.ts --ac AC-X
   ```

4. If consensus is `fail` after the first attempt, do ONE retry of the implementation step, then re-evaluate. After that, leave it as failed and continue to the next leaf — `clarify evolve` handles persistent failures.

## Step 3 — finalize

```bash
${CLAUDE_PLUGIN_ROOT:-.}/bin/clarify-run.sh run-finalize.ts
```

Print the rolled-up status. If any AC failed, suggest the user run `clarify evolve`. If all passed, congratulate them and recommend `clarify status` for a final drift check.
