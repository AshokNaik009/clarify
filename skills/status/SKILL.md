---
name: clarify-status
description: Report current phase, AC progress, and drift (scope cheap; intent only with --deep).
trigger: "clarify status"
---

# clarify status [--deep]

Report on the live `.clarify/state.json` and `.clarify/seed.yaml`.

## Run

```bash
npx tsx ${CLAUDE_PLUGIN_DIR:-.}/scripts/status.ts ${ARGS}
```

Pass `--deep` through if the user invoked `clarify status --deep`. Optional: pass `--since <git-ref>` (defaults to `HEAD~1`) for a different drift baseline.

## Interpret the output

The script prints JSON. Translate it for the user:

1. **Phase** — what stage they're in (`interviewing` / `executing` / `evaluating` / `evolving` / `done`).
2. **AC summary** — how many ACs passed / failed / pending.
3. **Drift verdict**:
   - `aligned` (worst drift score < drift_warn): all good.
   - `drifting` (drift_warn ≤ score < drift_fail): warn the user. List `rogue_files`.
   - `diverged` (score ≥ drift_fail): strongly recommend `clarify evolve` or revisit the seed.
4. **`--deep` only** — surface the `narrative` from intent drift verbatim.

## Output template

```
clarify status (seed: <seed_id>, phase: <phase>)
  ACs: <n_passed> passed, <n_failed> failed, <n_pending> pending
  Drift: <verdict>  (scope: <scope_score>, intent: <intent_score or n/a>)
  Rogue files: <comma-separated list, or "none">

  Narrative (deep): <one or two lines>
```

If `seed_path_exists=false`, tell the user there's no seed yet — they should run `clarify interview "<idea>"` first.
