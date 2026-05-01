# `copy_paths`
[INTENT: CONTEXT]

Copies files or directories to new destinations while keeping the source in place.

---

## What this endpoint does
[INTENT: CONTEXT]

- accepts a guarded `operations[]` batch,
- validates source and destination paths,
- creates missing destination parent directories recursively,
- copies files directly or directories recursively,
- returns a deterministic batch summary.

---

## Request shape at a glance
[INTENT: REFERENCE]

- `operations[]`
  - `sourcePath`
  - `destinationPath`
  - optional `recursive`
  - optional `overwrite`

---

## Use this endpoint when
[INTENT: CONTEXT]

- the caller wants to duplicate an existing file or directory,
- the original source must remain in place,
- destination parents may need to be created automatically,
- the operation may need optional recursion or optional overwrite.

---

## Do not use it for
[INTENT: CONSTRAINT]

- moving or renaming a source,
- creating directories only,
- mutating file contents,
- deleting filesystem items.

---

## Key guardrails
[INTENT: REFERENCE]

- up to `200` operations per request,
- up to `4096` characters per path,
- source remains in place,
- directory sources require `recursive=true`,
- overlapping copy batches are rejected before unsafe execution.

---

## Local documentation
[INTENT: REFERENCE]

- [`CONVENTIONS.md`](./CONVENTIONS.md) — endpoint-local conventions and guardrails
- [`DESCRIPTION.md`](./DESCRIPTION.md) — endpoint-local architectural description for LLM agents
