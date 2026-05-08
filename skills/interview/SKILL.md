---
name: clarify-interview
description: Run a Socratic Q&A loop until ambiguity drops below threshold, then crystallize an immutable seed.yaml.
trigger: "clarify interview"
---

# clarify interview "<one-line idea>"

You drive a Socratic interview that ends with a written seed spec. Your job is to **drive ambiguity below `thresholds.ambiguity_max` (default 0.2)** by asking the user one question at a time. You — not the user — pick the questions.

## Step 1 — initialize

If `.clarify/state.json` does not exist, ask the user to confirm their one-line idea (the part after `clarify interview`). Record it as the first turn synthetically:

```bash
npx tsx ${CLAUDE_PLUGIN_DIR:-.}/scripts/interview-record.ts \
  --q "Initial idea" \
  --a "<the user's one-line idea verbatim>" \
  --idea "<the user's one-line idea verbatim>"
```

Read back the JSON output (notably `ambiguity_score` and `unfilled_slots`).

## Step 2 — ask one question at a time

Look at `unfilled_slots` (subset of: language, runtime, persistence, scope, success_criteria, constraints) and ask **one** targeted Socratic question that resolves the most load-bearing unfilled slot.

Good questions:
- "Single user or multi-user?" (scope)
- "Where should data live — file, sqlite, in-memory?" (persistence)
- "What language and runtime do you want this in?" (language, runtime)
- "How will you know it's done — tests passing, manual demo, something else?" (success_criteria)
- "Anything this must NOT do? Network calls, persistence, side effects?" (constraints)

Bad questions: open-ended, multi-part, or things you can derive from earlier answers.

After the user replies, record the turn:

```bash
npx tsx ${CLAUDE_PLUGIN_DIR:-.}/scripts/interview-record.ts --q "<your question>" --a "<the user's answer>"
```

Repeat until `ambiguity_score <= thresholds.ambiguity_max` (default 0.2). Hard cap: 8 turns. If ambiguity won't drop, surface the remaining unfilled slots to the user verbatim and ask them to volunteer answers.

## Step 3 — crystallize

Once ambiguity is below the threshold:

```bash
npx tsx ${CLAUDE_PLUGIN_DIR:-.}/scripts/seed-crystallize.ts
```

This shells out to `claude -p` and writes `.clarify/seed.yaml`. Print the seed back to the user (read the file) and explicitly ask:

> "Approve this seed and proceed to `clarify run`? (yes/no/edit)"

If they say **edit**, ask what they want changed and re-run a 1–2 question mini-interview, then re-crystallize.

## Step 4 — output

End your response with a one-line summary: `seed_id`, number of ACs, location of the seed file. Do NOT proceed to `clarify run` automatically.
