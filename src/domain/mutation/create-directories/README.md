# `create_directories`
[INTENT: CONTEXT]

Creates one or more directory paths, including missing parent directories.

---

## What this endpoint does
[INTENT: CONTEXT]

- accepts a guarded `paths[]` batch,
- validates each directory path for safe creation,
- creates directories recursively,
- returns a deterministic batch summary.

---

## Request shape at a glance
[INTENT: REFERENCE]

- `paths[]`

Each item is a directory path to create.

---

## Use this endpoint when
[INTENT: CONTEXT]

- the caller wants directories to exist as directories,
- missing parent directories should be created automatically,
- the goal is not file creation, copy, move, or content mutation.

---

## Do not use it for
[INTENT: CONSTRAINT]

- creating files with content,
- copying filesystem items,
- moving or renaming filesystem items,
- mutating file contents.

`copy_paths` and `move_paths` already create missing destination parent directories themselves, so `create_directories` is not a required pre-step for those tools.

---

## Key guardrails
[INTENT: REFERENCE]

- up to `200` paths per request,
- up to `4096` characters per path,
- server-side path validation before creation,
- directory-only semantics.

---

## Local documentation
[INTENT: REFERENCE]

- [`CONVENTIONS.md`](./CONVENTIONS.md) — endpoint-local conventions and guardrails
- [`DESCRIPTION.md`](./DESCRIPTION.md) — endpoint-local architectural description for LLM agents
