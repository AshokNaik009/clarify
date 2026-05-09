---
name: clarify-help
description: List the clarify commands and what each does.
trigger: "clarify help"
---

# clarify help

Print this exact block to the user (no extra prose):

```
clarify — specification-first AI coding workflow

Commands:
  clarify interview "<one-line idea>"   Run a Socratic interview, write seed.yaml.
  clarify scan                           Snapshot the project's manifests + summary into state.scan.
  clarify ingest <ticket>                Brownfield-native: ticket + scan → seed.yaml in one call.
  clarify detect                         Author seed.mechanical_checks from project manifests.
  clarify run                            Execute the seed's AC tree.
  clarify evaluate [--ac AC-X | --all]   3-stage eval pipeline.
  clarify evolve                         Diagnose failures; rewrite seed or fix code; retry.
  clarify ralph [flags]                  Loop evaluate→evolve until convergence or hard cap.
  clarify unstuck [persona]              Reframe a stuck AC through a lateral-thinking persona.
  clarify status [--deep]                Drift report (scope cheap; intent with --deep).
  clarify help                           This message.

State lives in .clarify/ at the project root:
  .clarify/seed.yaml          Immutable contract for one cycle.
  .clarify/state.json         Live execution state.
  .clarify/transcripts/*.md   Interview snapshots.
  .clarify/evolutions/*.yaml  Evolved seeds, one per evolution iteration.

Backend: claude (default). Set CLARIFY_BACKEND env var to override (v1: claude only).
Docs: see docs/architecture.md, docs/seed-reference.md, docs/recipes.md.
```
