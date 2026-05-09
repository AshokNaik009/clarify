---
name: clarify-evaluate
description: "Use when the user says `clarify evaluate`, `/clarify-evaluate`, or asks clarify to run the 3-stage pipeline (mechanical → LLM review → consensus) on one AC or all of them."
---

# clarify evaluate [--ac AC-X | --all]

Run the 3-stage pipeline against a single AC (`--ac`) or every leaf AC (`--all`).

## Resolving targets

- `--ac AC-X` — exactly that AC.
- `--all` — every leaf AC in the seed, in declared order.
- (no flag) — assume `--all` and warn the user.

To enumerate leaves: `${CLAUDE_PLUGIN_ROOT:-.}/bin/clarify-run.sh run-init.ts` — its output's `leaf_acs` array.

## Pipeline

For each target AC, in order:

```bash
# Stage 1 — Mechanical (shell exit codes)
${CLAUDE_PLUGIN_ROOT:-.}/bin/clarify-run.sh eval-mechanical.ts --ac AC-X

# Stage 2 — LLM review (semantic alignment)
${CLAUDE_PLUGIN_ROOT:-.}/bin/clarify-run.sh eval-llm.ts --ac AC-X

# Stage 3 — Consensus (mechanical-all-pass AND llm.score >= consensus_min)
${CLAUDE_PLUGIN_ROOT:-.}/bin/clarify-run.sh eval-consensus.ts --ac AC-X
```

If Stage 1 fails (any mechanical check non-zero), **still run Stage 2 and Stage 3** — the consensus step records the combined verdict.

## Output

After all targets, print a concise table:

| AC | mechanical | llm score | consensus |
|---|---|---|---|
| AC-1.1 | pass | 0.91 | pass |
| AC-1.2 | fail | 0.40 | fail |

Tell the user: if any AC failed, suggest `clarify evolve`. If all passed, suggest `clarify status` to confirm no scope drift.
