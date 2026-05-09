---
name: clarify-ingest
description: Brownfield-native entry. Read a ticket, run a 1-shot LLM crystallization, then resolve at most 5 gap questions with the user before writing the seed.
trigger: "clarify ingest"
---

# clarify ingest <ticket-file>  (or `--text "<paste>"`)

Two-phase brownfield ingestion:

1. **Phase 1 (draft + gaps)** — `seed-architect` persona reads the ticket and the codebase scan, drafts a seed, and surfaces ≤5 high-impact decisions the ticket left open.
2. **Phase 2 (bridging interview + finalize)** — you ask the user the gap questions through `AskUserQuestion`, then re-run the persona with the answers folded in. The seed file is written **only after** Phase 2 (or immediately, if Phase 1 found no gaps).

Single bridging round only. Hard cap at 5 questions. Anything the LLM would have asked beyond that is stashed in `seed.brownfield.unresolved_gaps[]` so the LLM-review stage sees it later.

## Step 1 — pre-flight: scan must exist

Read `.clarify/state.json`. If `state.scan` is missing, run `clarify scan` first (chain to the scan skill) before continuing. The seed-architect persona references the scan summary to infer `allowed_paths` and `existing_patterns`.

## Step 2 — locate the ticket

Accept any of these forms:

- `clarify ingest path/to/ticket.md` — file path (relative or absolute)
- `clarify ingest --file path/to/ticket.md`
- `clarify ingest --text "As a user, I want to …"` — paste content inline

If no ticket is provided, stop and ask the user for one. Do NOT invent ticket content.

If the user appended `--no-bridge`, skip the bridging interview entirely (one-shot mode for users who trust the ticket).

## Step 3 — Phase 1: draft + gaps

```bash
npx tsx ${CLAUDE_PLUGIN_DIR:-.}/scripts/ingest-ticket.ts <ticket-path-or-flags>
```

The script runs ONE `claude -p` call and emits a JSON envelope on stdout. Two shapes:

### 3a. `phase: "finalized"` — no gaps, fast path

The ticket was unambiguous (or `--no-bridge` was passed). The seed is already at `.clarify/seed.yaml`. Skip Step 4 and go to Step 5.

### 3b. `phase: "draft"` — gaps need user input

The script wrote `.clarify/ingest-draft.json` and returned a `gaps[]` array. Each gap has `{field, question, why, suggested_options}`. Continue to Step 4.

## Step 4 — bridging interview (only if Phase 1 returned gaps)

Walk the `gaps[]` in order and ask the user **one question per gap** via `AskUserQuestion`. **Hard cap: 5 questions per ingest run.**

For each gap, build the question payload:

```json
{
  "questions": [{
    "question": "<gap.question>\n\nWhy this matters: <gap.why>",
    "header": "Gap <i> — <gap.field>",
    "options": [
      // For each suggestion in gap.suggested_options (≤4 entries):
      {"label": "<suggestion>", "description": ""},
      {"label": "Decide later", "description": "Skip — recorded in seed.brownfield.unresolved_gaps"}
    ],
    "multiSelect": false
  }]
}
```

If the user picks "Decide later", record the gap as `{ field, question, answer: "", deferred: true }`. Otherwise record `{ field, question, answer: <user's choice or free-form text>, deferred: false }`.

Build the answers JSON array as you go:

```json
[
  { "field": "brownfield.forbidden_new_dependencies", "question": "...", "answer": "enforce", "deferred": false },
  { "field": "AC-2.allowed_paths", "question": "...", "answer": "src/api/webhooks/**", "deferred": false }
]
```

Once all gaps are answered (or deferred), pass the answers to the finalize script. Use a heredoc temp file so we don't have to escape JSON on the shell:

```bash
ANSWERS=$(mktemp)
cat > "$ANSWERS" <<'JSON'
[ ... the answers array ... ]
JSON
npx tsx ${CLAUDE_PLUGIN_DIR:-.}/scripts/ingest-finalize.ts --answers "$ANSWERS"
rm -f "$ANSWERS"
```

The finalize script reads `.clarify/ingest-draft.json`, runs `claude -p` once more in `MODE=finalize` with the answers folded in, validates against `SeedSchema`, writes `.clarify/seed.yaml`, and clears the draft file.

## Step 5 — show the user the crystallized seed

Read `.clarify/seed.yaml` and print:

- `seed_id`
- The number of leaf ACs
- For each AC: `id` + `title` + `allowed_paths` (this is the most common place for problems — verify the paths cover real code).
- `brownfield.tech_stack`, `brownfield.existing_patterns`, `brownfield.forbidden_new_dependencies`
- `brownfield.unresolved_gaps` if non-empty (anything the user deferred + any overflow beyond the 5-question cap)
- `mechanical_checks` (likely empty — that's normal; `clarify detect` will fill them)

Then ask:

> "Approve this seed and proceed to `clarify detect` (to fill mechanical_checks) and then `clarify run` / `clarify ralph`? (yes/no/edit)"

If the user says **edit**, ask what they want changed. Hand-edit the seed file directly, or rerun `clarify ingest` with a clarified ticket.

## Step 6 — output

End with a one-line summary: `seed_id`, AC count, ticket reference, # of gaps resolved vs deferred. Do NOT auto-run `clarify detect` or `clarify run` — wait for the user.
