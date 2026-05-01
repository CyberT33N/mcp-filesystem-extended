# Conventions: `delete_paths`
[INTENT: CONSTRAINT]

---

## 1. Local SSOT Role
[INTENT: CONTEXT]

This file is the endpoint-local single source of truth for the `delete_paths` conventions and guardrails.

It owns the rules for:

- destructive deletion semantics,
- target-only path-removal boundaries,
- explicit recursive directory-deletion intent,
- destructive batch guardrails,
- family-boundary distinctions from copy, move, and file-content mutation behavior.

The endpoint-local architecture description lives in [`DESCRIPTION.md`](./DESCRIPTION.md), and the concise developer-facing summary lives in [`README.md`](./README.md).

---

## 2. Canonical Request Surface
[INTENT: REFERENCE]

| Surface | Rule |
| --- | --- |
| Tool name | `delete_paths` |
| Batch container | `paths[]` |
| Top-level field | optional `recursive` |
| Target behavior | Files are deleted directly; directories require explicit recursive intent |
| Destination behavior | None — this endpoint has no destination semantics |

### Canonical same-concept rule
[INTENT: CONSTRAINT]

The public contract is target-only destructive deletion.

Do not rename or reframe this same-concept surface as:

- non-destructive copy behavior,
- source-to-destination move or rename behavior,
- directory-only creation,
- file-content mutation.

---

## 3. Delete Semantics
[INTENT: CONSTRAINT]

### 3.1 Target-only destructive removal

`delete_paths` removes requested filesystem targets.

After a successful operation, the target no longer remains at its original path.

### 3.2 Explicit recursive directory intent

Files may be deleted directly.

Directories may be deleted only when `recursive=true` is explicitly enabled.

### 3.3 No destination semantics

This endpoint does not create, choose, or validate any destination path.

Its contract is removal-only.

### 3.4 Not for rewrite workflows

The public registration surface explicitly scopes this endpoint to removal workflows.

It must not be documented as an in-place rewrite shortcut, a rename step, or a content-replacement helper.

---

## 4. Guardrails and Safety Model
[INTENT: CONSTRAINT]

| Surface | Limit | Meaning |
| --- | --- | --- |
| Paths per request | `200` | Maximum number of deletion targets in one mutation batch |
| Path length | `4096` characters | Maximum length for each target path string |

### Primary guardrail model

The path-mutation family is governed primarily by bounded batch breadth, allowed-directory validation, and blast-radius awareness.

For `delete_paths`, that means the endpoint rejects or fails early when:

- the delete batch exceeds the allowed target count,
- a target path falls outside the allowed-directory scope,
- a directory is requested without `recursive=true`,
- filesystem deletion fails for the requested target.

---

## 5. Boundary Rules
[INTENT: CONSTRAINT]

### 5.1 Distinction from `copy_paths`

`copy_paths` preserves the source and materializes a destination.

`delete_paths` removes the requested target and has no destination semantics.

### 5.2 Distinction from `move_paths`

`move_paths` relocates a source to a destination path.

`delete_paths` removes targets without relocation, destination-parent creation, or overwrite semantics.

### 5.3 Distinction from file-content mutation

`delete_paths` is a path-oriented endpoint.

It must not be described as append, replacement, diff ingestion, line-range mutation, or delete-for-rewrite behavior.

---

## 6. Practical Use Guidance
[INTENT: CONSTRAINT]

Use this endpoint when the caller needs existing filesystem items removed and the operation is intentionally destructive.

Choose another mutation surface when the real operation is:

- preserving the source while duplicating it,
- relocating or renaming a source,
- creating directories only,
- mutating file contents directly.
