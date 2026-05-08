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

## Smoke without real Claude

Set `CLARIFY_FAKE_CLAUDE='{"score": 0.9, "verdict": "pass", "notes": "ok"}'` to short-circuit `claude -p` calls — useful for CI runs of the eval scripts without burning tokens. The fake string is returned verbatim from every `oneShot` call.
