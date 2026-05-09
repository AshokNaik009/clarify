---
name: clarify-scan
description: "Use when the user says `clarify scan`, `/clarify-scan`, or asks to snapshot/scan the project's existing codebase before brownfield ingest. Walks manifests (package.json, pyproject.toml, tsconfig, Dockerfile, …) and writes a ≤500-word summary into state.scan."
---

# clarify scan

You take a snapshot of the user's existing codebase so the brownfield interview, `clarify ingest`, and the LLM-review stage all see the same picture of what already exists. Idempotent — running it again overwrites the previous snapshot.

## When to run

- Before `clarify ingest <ticket>` — `ingest` requires a scan.
- Whenever the user changes the project's tech stack, framework, or top-level layout and wants the seed/eval prompts to reflect it.

## Step 1 — execute the script

```bash
${CLAUDE_PLUGIN_ROOT:-.}/bin/clarify-run.sh scan-codebase.ts
```

The script:
1. Walks the project root for known manifests (`package.json`, `pyproject.toml`, `tsconfig.json`, `Dockerfile`, `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `Cargo.toml`, `go.mod`, …).
2. Runs the `codebase-explorer` persona via `claude -p` to produce a ≤500-word summary covering Tech Stack, Key Types, Patterns, Protocols & APIs, Conventions.
3. Writes the snapshot into `.clarify/state.json` as `state.scan` and prints a JSON envelope to stdout.

If no manifests are detected, the script returns `{ ok: true, empty: true, … }` and recommends staying greenfield.

## Step 2 — show the user what was captured

Read `.clarify/state.json`, look at `scan.summary`, and print:

- The one-line `tech_stack` from the snapshot.
- The list of detected manifests.
- Whether the project is treated as brownfield (`scan.is_brownfield`).
- The first 30 lines of `scan.summary` so the user can sanity-check it.

End with a one-line next step:

> `📍 Next: clarify ingest <ticket-file>` (brownfield) or `clarify interview "<idea>"` (greenfield).
