# Conventions: `move_paths`
[INTENT: CONSTRAINT]

---

## 1. Local SSOT Role
[INTENT: CONTEXT]

This file is the endpoint-local single source of truth for the `move_paths` conventions and guardrails.

It owns the rules for:

- source-removing move and rename semantics,
- source-versus-destination ownership boundaries,
- automatic destination-parent creation,
- explicit overwrite behavior,
- destructive path-mutation guardrails,
- family-boundary distinctions from directory-only creation, copy, and delete behavior.

The endpoint-local architecture description lives in [`DESCRIPTION.md`](./DESCRIPTION.md), and the concise developer-facing summary lives in [`README.md`](./README.md).

---

## 2. Canonical Request Surface
[INTENT: REFERENCE]

| Surface | Rule |
| --- | --- |
| Tool name | `move_paths` |
| Batch container | `operations[]` |
| Per-operation fields | `sourcePath`, `destinationPath` |
| Top-level field | optional `overwrite` |
| Source behavior | Source no longer remains at the original path after a successful move |
| Destination behavior | Missing destination parent directories are created recursively |

### Canonical same-concept rule
[INTENT: CONSTRAINT]

The public contract is source-to-destination move or rename behavior.

Do not rename or reframe this same-concept surface as:

- non-destructive copy behavior,
- target-only delete behavior,
- directory-only creation,
- file-content mutation.

---

## 3. Move Semantics
[INTENT: CONSTRAINT]

### 3.1 Source-removing relocation or rename

`move_paths` transfers the requested filesystem item to the destination path.

After a successful operation, the original source no longer remains at the original path.

### 3.2 Destination-parent creation

The endpoint creates missing destination parent directories recursively before rename execution.

Because that behavior is already owned locally, callers do not need `create_directories` as a prerequisite when the real objective is relocation or rename.

### 3.3 Overwrite behavior

- existing destinations are rejected by default,
- callers must opt in with `overwrite=true` when replacement of an existing destination is intended,
- when overwrite is enabled and the destination already exists, the destination is removed before the rename runs.

### 3.4 File versus directory behavior

- file sources and directory sources are both supported,
- there is no separate recursive flag on this endpoint,
- the same contract covers same-parent rename and cross-directory relocation.

---

## 4. Guardrails and Safety Model
[INTENT: CONSTRAINT]

| Surface | Limit | Meaning |
| --- | --- | --- |
| Operations per request | `200` | Maximum number of move operations in one mutation batch |
| Path length | `4096` characters | Maximum length for source and destination path strings |

### Primary guardrail model

The path-mutation family is governed primarily by bounded batch breadth, allowed-directory path validation, and destructive-mutation awareness.

For `move_paths`, that means the endpoint rejects or fails early when:

- the move batch exceeds the allowed operation count,
- the source or destination path falls outside the allowed-directory scope,
- the source does not exist,
- the destination already exists and `overwrite` is not enabled,
- destination removal or rename fails.

---

## 5. Boundary Rules
[INTENT: CONSTRAINT]

### 5.1 Distinction from `create_directories`

`create_directories` owns directory-only creation.

`move_paths` instead owns relocation or rename of existing filesystem items and already creates destination parents internally when needed.

### 5.2 Distinction from `copy_paths`

`copy_paths` preserves the original source.

`move_paths` transfers the source so it no longer remains at the original path.

### 5.3 Distinction from `delete_paths`

`delete_paths` removes targets without destination semantics.

`move_paths` is still a destination-oriented relocation surface, even though it removes the source from the original path as part of the move.

### 5.4 Distinction from file-content mutation

`move_paths` operates on filesystem items and path relationships.

It must not be described as append, replacement, diff ingestion, or line-range mutation behavior.

---

## 6. Practical Use Guidance
[INTENT: CONSTRAINT]

Use this endpoint when the caller wants an existing file or directory relocated or renamed and the original source should no longer remain in place.

Choose another mutation surface when the real operation is:

- duplicating a source while keeping it in place,
- creating directories only,
- deleting targets without a destination,
- mutating file contents directly.
