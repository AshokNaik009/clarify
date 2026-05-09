---
name: clarify-detect
description: One LLM call against the project's manifests to fill seed.mechanical_checks with the project's actual lint/typecheck/test/build commands.
trigger: "clarify detect"
---

# clarify detect

You author the deterministic Stage-1 commands the evaluator runs against each AC. The script reads the existing manifests in the project root, asks `claude -p` for the right commands, validates the response, and writes them back into `.clarify/seed.yaml` under `mechanical_checks`.

## When to run

- **Automatically** before the first `clarify evaluate` if `seed.mechanical_checks` is empty — `evaluate` should call this skill itself in that case.
- Manually whenever the toolchain changes and you want fresh commands.
- With `--force` to overwrite existing `mechanical_checks`.

## Step 1 — make sure a seed exists

If `.clarify/seed.yaml` is missing, stop and tell the user to run `clarify ingest <ticket>` (brownfield) or `clarify interview "<idea>"` (greenfield) first.

## Step 2 — run the script

```bash
npx tsx ${CLAUDE_PLUGIN_DIR:-.}/scripts/detect-mechanical.ts
# or, to overwrite existing checks:
npx tsx ${CLAUDE_PLUGIN_DIR:-.}/scripts/detect-mechanical.ts --force
```

## Step 3 — show the user the proposed checks

Print the array verbatim from the script's JSON output, then explicitly ask:

> "Approve these checks? (yes/edit). I'll wire them straight into `seed.yaml` if you say yes."

If the user says **edit**, ask what they want changed and either:
- write the corrections directly into `.clarify/seed.yaml` (keep the array shape: `[{ name, cmd, timeout_ms? }]`), or
- re-run `clarify detect --force` after the user updates the manifests.

If the script reports `empty: true` (no manifests), explain that — and suggest the user write a single check by hand, e.g. `- name: lint\n  cmd: npm run lint`.
