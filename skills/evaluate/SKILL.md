---
name: clarify-evaluate
description: Run the 3-stage evaluation pipeline (mechanical → LLM review → consensus) for one AC or all.
trigger: "clarify evaluate"
---

# clarify evaluate [--ac AC-X | --all]

Run the 3-stage pipeline against a single AC (`--ac`) or every leaf AC (`--all`).

## Resolving targets

- `--ac AC-X` — exactly that AC.
- `--all` — every leaf AC in the seed, in declared order.
- (no flag) — assume `--all` and warn the user.

To enumerate leaves: `npx tsx ${CLAUDE_PLUGIN_DIR:-.}/scripts/run-init.ts` — its output's `leaf_acs` array.

## Pipeline

For each target AC, in order:

```bash
# Stage 1 — Mechanical (shell exit codes)
npx tsx ${CLAUDE_PLUGIN_DIR:-.}/scripts/eval-mechanical.ts --ac AC-X

# Stage 2 — LLM review (semantic alignment)
npx tsx ${CLAUDE_PLUGIN_DIR:-.}/scripts/eval-llm.ts --ac AC-X

# Stage 3 — Consensus (mechanical-all-pass AND llm.score >= consensus_min)
npx tsx ${CLAUDE_PLUGIN_DIR:-.}/scripts/eval-consensus.ts --ac AC-X
```

If Stage 1 fails (any mechanical check non-zero), **still run Stage 2 and Stage 3** — the consensus step records the combined verdict.

## Output

After all targets, print a concise table:

| AC | mechanical | llm score | consensus |
|---|---|---|---|
| AC-1.1 | pass | 0.91 | pass |
| AC-1.2 | fail | 0.40 | fail |

Tell the user: if any AC failed, suggest `clarify evolve`. If all passed, suggest `clarify status` to confirm no scope drift.
