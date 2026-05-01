# `delete_paths`
[INTENT: CONTEXT]

Deletes files or directories through a destructive, target-only path-mutation surface.

---

## What this endpoint does
[INTENT: CONTEXT]

- accepts a guarded `paths[]` batch,
- validates every target path,
- deletes files directly,
- deletes directories only when `recursive=true`,
- returns a deterministic batch summary.

---

## Request shape at a glance
[INTENT: REFERENCE]

- `paths[]`
- optional top-level `recursive`

---

## Use this endpoint when
[INTENT: CONTEXT]

- the caller wants existing filesystem items removed,
- the operation is intentionally destructive,
- directory deletion must be made explicit with `recursive=true`,
- no destination path is part of the workflow.

---

## Do not use it for
[INTENT: CONSTRAINT]

- preserving the source while duplicating it,
- relocating or renaming a source,
- creating directories only,
- mutating file contents.

---

## Key guardrails
[INTENT: REFERENCE]

- up to `200` targets per request,
- up to `4096` characters per path,
- directories require explicit `recursive=true`,
- all targets must stay inside allowed directories,
- no destination semantics exist on this endpoint.

---

## Local documentation
[INTENT: REFERENCE]

- [`CONVENTIONS.md`](./CONVENTIONS.md) — endpoint-local conventions and guardrails
- [`DESCRIPTION.md`](./DESCRIPTION.md) — endpoint-local architectural description for LLM agents
