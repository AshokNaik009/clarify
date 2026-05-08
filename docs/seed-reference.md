# `seed.yaml` reference

Every field, every constraint, in one place.

## Top-level

| Field | Type | Required | Notes |
|---|---|---|---|
| `version` | `1` literal | yes | Bump only on breaking schema changes. |
| `id` | string | yes | kebab-case, e.g. `seed-2026-05-08-todo-app`. |
| `created_at` | ISO 8601 with offset | yes | `2026-05-08T10:30:00Z`. |
| `backend` | string | no | Default `claude`. v1 supports `claude` only. |
| `description` | string | yes | 1–3 sentence summary, plain English. |
| `constraints` | object | no | See below. |
| `acceptance_criteria` | `AC[]` | yes (≥1) | Recursive tree. |
| `mechanical_checks` | `{name,cmd}[]` | no | Shell commands; non-zero exit = fail. |
| `thresholds` | object | no | All fields default. See below. |
| `lineage` | object | yes | Provenance (audit trail). |

## `AC` (recursive)

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | `AC-1`, `AC-1.2`, `AC-1.2.3`. |
| `title` | string | yes | Imperative, testable. |
| `intent` | string | no | Why this AC exists; how a human verifies it. |
| `allowed_paths` | string[] | no | Globs (`**`, `*`, `?`). Leaves should always declare paths. |
| `children` | `AC[]` | no | Nested ACs; if present, the AC is non-leaf. |

A parent's effective `allowed_paths` defaults to the union of its children's paths.

## `constraints`

| Field | Type | Notes |
|---|---|---|
| `language` | string | e.g. `typescript`. |
| `runtime` | string | e.g. `node>=20`. |
| `packaging` | string | e.g. `single npm package`. |
| `forbidden_paths` | string[] | Globs that must NOT be modified. |
| `allowed_globals` | string[] | Free-form (e.g. `process.env`). |

## `thresholds` (defaults)

| Field | Default | Meaning |
|---|---|---|
| `ambiguity_max` | 0.2 | Interview ends when ambiguity drops below this. |
| `consensus_min` | 0.8 | LLM-review score must be ≥ this for a pass. |
| `drift_warn` | 0.3 | Status flags `drifting` above this. |
| `drift_fail` | 0.7 | Status flags `diverged` above this. |
| `max_evolutions` | 3 | Evolve loop hard cap. |

## `lineage`

| Field | Type | Notes |
|---|---|---|
| `source` | `interview \| evolution \| manual` | How the seed was created. |
| `interview_transcript` | string \| null | Path to the transcript snapshot. |
| `parent_seed` | string \| null | Set on evolved seeds. |

## Example

See [`tests/fixtures/seed.todo.yaml`](../tests/fixtures/seed.todo.yaml).
