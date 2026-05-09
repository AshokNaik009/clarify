# Recipes

End-to-end manual smoke tests. Use these to validate clarify against real Claude.

## Recipe 1 — todo CLI (greenfield)

```
clarify interview "a tiny todo CLI in TypeScript that persists to a JSON file"
# answer the questions, ambiguity drops, seed.yaml is written
clarify run
# clarify executes each leaf AC; for each, it implements then evaluates
clarify status
```

Expected: `phase=done`, all ACs `passed`, drift `aligned`.

## Recipe 2 — evolve on under-spec

Same as Recipe 1, but during the interview answer "I don't care" to the persistence question. The seed will under-specify storage. Expected:

- `clarify run` produces some failed ACs.
- `clarify evolve` diagnoses `under_specification`, asks 1–2 clarifying questions, rewrites the seed under `.clarify/evolutions/1.yaml`, and updates `seed.yaml`.
- Re-running `clarify evaluate --all` now passes.

## Recipe 3 — drift detection

After Recipe 1, manually edit a file that no AC covers (say, add `random.txt` at repo root). Then:

```
clarify status
```

Expected: `drift.scope_score > 0`, `rogue_files: ['random.txt']`, verdict `drifting`. Run with `--deep` for an LLM intent narrative.

## Recipe 4 — failed mechanical check

Edit one AC's implementation to deliberately break a test. Expected:

- `clarify evaluate --ac AC-X` shows `mechanical: fail`, consensus `fail`.
- `clarify evolve` diagnoses `implementation_bug` (not under-spec) and either:
  - tells you the suggested fix and asks you to apply it, or
  - applies it itself if the skill is configured to do so.

## Recipe 5 — Ralph until convergence

For an unattended run where you want clarify to keep trying without manual intervention:

```
clarify interview "a tiny adder CLI in TypeScript"
clarify ralph --max-iterations 5
```

Expected: `state.ralph.status === 'converged'`, `state.ralph.iterations.length <= 5`, `phase === 'done'`. If Ralph stagnates instead, it will auto-invoke `clarify unstuck` exactly once before terminating as `stagnated_after_unstuck`. Inspect `state.unstuck[]` afterward to see which persona was tried and what was suggested.

Pass `--no-unstuck` to disable the escalation, `--per-iteration-timeout-ms 60000` to make each iteration fail fast, or `--total-timeout-ms 1800000` to cap the whole run at 30 minutes.

## Recipe 6 — Manual unstuck by persona

When you want a deliberate change of lens — say, the loop has been retrying `implementation_bug` fixes but you suspect the AC itself is wrong — name the persona explicitly:

```
clarify unstuck contrarian   # challenge the AC's underlying assumption
clarify unstuck simplifier   # cut scope; collapse two ACs into one
clarify unstuck architect    # restructure allowed_paths or split an AC
```

The skill reads `src/personas/<persona>.md`, applies that lens to the most recent failed AC, and surfaces a concrete next step. With no argument, the persona is auto-picked from the most recent failure category in `state.evaluations`.

## Smoke without real Claude

Set `CLARIFY_FAKE_CLAUDE='{"score": 0.9, "verdict": "pass", "notes": "ok"}'` to short-circuit `claude -p` calls — useful for CI runs of the eval scripts without burning tokens. The fake string is returned verbatim from every `oneShot` call.
