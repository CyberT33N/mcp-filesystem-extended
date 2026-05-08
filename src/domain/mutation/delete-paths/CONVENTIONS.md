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

This endpoint also follows the global public-limit-disclosure policy in [`public-limit-disclosure-governance.md`](../../../../conventions/guardrails/public-limit-disclosure-governance.md).

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
---

## 3A. Public Limit Disclosure Placement
[INTENT: CONSTRAINT]

`delete_paths` belongs to the path-mutation family and follows the global public-limit-disclosure policy with a request-shape-first emphasis.

### 3A.1 Parameter-description disclosure (required)

Stable request-shape limits belong in the schema-owned parameter descriptions because callers need them while constructing the deletion request.

For `delete_paths`, that includes:

- target path-length limits via `PATH_MAX_CHARS`
- target-count and batch breadth via `MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST`
- explicit recursive intent on the public `recursive` field

The endpoint-local rule is therefore:

> Request-shape limits must be disclosed in [`schema.ts`](./schema.ts) through constant-backed parameter descriptions.

### 3A.2 Tool-description disclosure (selective)

Stable operation-wide delivery rules may appear in the runtime tool description, but this family prioritizes concise request-shape communication over aggressive numeric tool-description disclosure.

For `delete_paths`, the important runtime rule is that:

- successful output remains a concise path-mutation summary
- directories still require explicit recursive intent
- destructive removal remains distinct from relocation, copying, or content mutation

### 3A.3 Non-prioritized internal limits (required non-disclosure rationale)

This endpoint must not promote the following internal or broader server-owned limits into its routine public tool description as if they were the primary caller target:

- the exact global fuse as the dominant optimization number
- internal deletion implementation mechanics
- server-internal emergency/runtime guardrails

Those surfaces remain owned by shared architecture conventions because they are server-internal protection mechanics rather than the primary caller-actionable contract.

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
