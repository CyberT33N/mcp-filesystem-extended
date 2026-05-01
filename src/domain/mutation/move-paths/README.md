# `move_paths`
[INTENT: CONTEXT]

Moves or renames files or directories and removes the source from its original path.

---

## What this endpoint does
[INTENT: CONTEXT]

- accepts a guarded `operations[]` batch,
- validates source and destination paths,
- creates missing destination parent directories recursively,
- moves or renames files and directories,
- optionally replaces existing destinations when `overwrite=true`,
- returns a deterministic batch summary.

---

## Request shape at a glance
[INTENT: REFERENCE]

- `operations[]`
  - `sourcePath`
  - `destinationPath`
- optional top-level `overwrite`

---

## Use this endpoint when
[INTENT: CONTEXT]

- the caller wants to relocate or rename an existing file or directory,
- the original source must no longer remain in place,
- destination parents may need to be created automatically,
- destination replacement is intentional and explicit.

---

## Do not use it for
[INTENT: CONSTRAINT]

- preserving the source while duplicating it,
- creating directories only,
- mutating file contents,
- deleting targets without a destination.

---

## Key guardrails
[INTENT: REFERENCE]

- up to `200` operations per request,
- up to `4096` characters per path,
- the source must exist,
- destination parents are created automatically,
- overwrite is explicit and request-scoped.

---

## Local documentation
[INTENT: REFERENCE]

- [`CONVENTIONS.md`](./CONVENTIONS.md) — endpoint-local conventions and guardrails
- [`DESCRIPTION.md`](./DESCRIPTION.md) — endpoint-local architectural description for LLM agents
