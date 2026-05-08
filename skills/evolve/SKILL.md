---
name: clarify-evolve
description: When ACs fail, diagnose the failure category and either rewrite the seed or fix the code, then retry.
trigger: "clarify evolve"
---

# clarify evolve

Run when one or more ACs are stuck in `failed`. The loop iterates up to `thresholds.max_evolutions` (default 3).

## Step 1 — analyze

```bash
npx tsx ${CLAUDE_PLUGIN_DIR:-.}/scripts/evolve-analyze.ts > /tmp/clarify-analysis.json
```

Read `/tmp/clarify-analysis.json`. Three possible categories:

- **`implementation_bug`** → the seed is fine, the code is wrong.
- **`under_specification`** → the AC didn't pin down what "done" means.
- **`contradiction`** → two ACs (or AC + constraints) cannot both be satisfied.

## Step 2 — branch by category

### A. implementation_bug
1. Read `analysis.suggested_fix` and `analysis.affected_ac_ids`.
2. Use your native Edit/Write tools to fix the code, scoped to those ACs' `allowed_paths`.
3. Re-evaluate: `clarify evaluate --ac <each affected AC>`.
4. Done. Do NOT rewrite the seed.

### B. under_specification or contradiction
1. Read `analysis.questions_for_user` (max 3). Ask the user **one at a time** in chat. Collect answers.
2. Save the Q&A pairs to `/tmp/clarify-clarifications.json` as `[{q, a}, ...]` JSON.
3. Rewrite the seed:
   ```bash
   npx tsx ${CLAUDE_PLUGIN_DIR:-.}/scripts/evolve-rewrite-seed.ts \
     --analysis /tmp/clarify-analysis.json \
     --clarifications /tmp/clarify-clarifications.json
   ```
   This writes `.clarify/evolutions/<n>.yaml` and updates `seed.yaml` to the new spec.
4. Re-run the affected ACs: `clarify run` (or `clarify evaluate --ac AC-X` per AC).

## Step 3 — guardrail

Count the entries in `state.json#evolutions`. If it equals or exceeds `seed.thresholds.max_evolutions`, STOP and surface the situation to the user — propose either widening the threshold, decomposing the project further, or accepting partial completion. Do not silently keep evolving.

## Output

After each evolve cycle, print a one-line summary:
- "Evolution #2: rewrote seed (under-specification on AC-1.2). Re-run `clarify evaluate --all`."
- OR "Implementation bug fixed in AC-2.1. AC now passes."
