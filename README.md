# clarify

> Specification-first AI coding workflow as a Claude Code plugin.
> **Interview → Seed → Execute → Evaluate → Evolve.**
> TypeScript. Slim. Zero API keys.

---

## Status

**Pre-implementation. Read [`SPEC.md`](./SPEC.md) — that is the contract.**

Once the spec is approved, implementation lands behind it.

## What is this?

Most AI coding fails at the input, not the output. `clarify` is a Claude Code plugin that puts a structured specification phase in front of every coding task: it runs a Socratic interview, crystallizes the answers into an immutable seed spec with a hierarchical acceptance-criteria tree, executes against that tree, evaluates the result, and evolves the spec if anything fails.

Think: "what should Claude have asked me before generating this code?" — but enforced.

## Inspired by

The Python project [Q00/ouroboros](https://github.com/Q00/ouroboros). `clarify` is a deliberately-slim TypeScript port focused on the 5 most load-bearing features (interview, seed/AC tree, evaluation pipeline, evolution loop, drift detection) — the rest of Ouroboros's surface area is intentionally cut. See [`SPEC.md` §2.1](./SPEC.md) for the explicit out-of-scope list.

## Install (once implemented)

```bash
claude plugin marketplace add AshokNaik009/clarify
claude plugin install clarify@clarify
```

## Commands (planned)

| Command | What it does |
|---|---|
| `clarify interview "<idea>"` | Socratic Q&A → writes an immutable seed.yaml |
| `clarify run` | Execute the seed's acceptance-criteria tree |
| `clarify evaluate` | 3-stage pipeline: mechanical → LLM review → consensus |
| `clarify evolve` | Refine seed on failure, retry until it passes |
| `clarify status [--deep]` | Drift detection: scope (cheap) + intent (LLM, opt-in) |

## Why TypeScript?

Designed for environments where TypeScript is the default runtime: Claude Code skill plugins, Vercel/serverless edges, monorepos with TS tooling, and anywhere `npx tsx` works. No Python required.

## License

MIT. See [`LICENSE`](./LICENSE).
