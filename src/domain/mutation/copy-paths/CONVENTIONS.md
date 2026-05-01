# Conventions: `copy_paths`
[INTENT: CONSTRAINT]

---

## 1. Local SSOT Role
[INTENT: CONTEXT]

This file is the endpoint-local single source of truth for the `copy_paths` conventions and guardrails.

It owns the rules for:

- non-destructive copy semantics,
- source-versus-destination ownership boundaries,
- automatic destination-parent creation,
- recursive directory-copy semantics,
- overwrite behavior,
- overlap-safe batch execution,
- family-boundary distinctions from directory-only creation and move behavior.

The endpoint-local architecture description lives in [`DESCRIPTION.md`](./DESCRIPTION.md), and the concise developer-facing summary lives in [`README.md`](./README.md).

---

## 2. Canonical Request Surface
[INTENT: REFERENCE]

| Surface | Rule |
| --- | --- |
| Tool name | `copy_paths` |
| Batch container | `operations[]` |
| Per-operation fields | `sourcePath`, `destinationPath`, optional `recursive`, optional `overwrite` |
| Source behavior | Source remains in place after copy |
| Destination behavior | Missing destination parent directories are created recursively |

### Canonical same-concept rule
[INTENT: CONSTRAINT]

The public contract is source-to-destination copy.

Do not rename or reframe this same-concept surface as:

- move or rename behavior,
- directory-only creation,
- file-content mutation,
- delete semantics.

---

## 3. Copy Semantics
[INTENT: CONSTRAINT]

### 3.1 Non-destructive source preservation

`copy_paths` keeps the source in place after the operation.

This is the defining boundary between copy and move.

### 3.2 Destination-parent creation

The endpoint creates missing destination parent directories recursively.

Because that behavior is already owned locally, callers do not need `create_directories` as a prerequisite when the real objective is copy.

### 3.3 File versus directory behavior

- file sources are copied directly to the destination path,
- directory sources require `recursive=true`,
- directory-copy requests fail when recursion is omitted.

### 3.4 Overwrite behavior

- existing destinations are rejected by default,
- callers must opt in with `overwrite=true` when replacement of an existing destination is intended.

---

## 4. Guardrails and Safety Model
[INTENT: CONSTRAINT]

| Surface | Limit | Meaning |
| --- | --- | --- |
| Operations per request | `200` | Maximum number of copy operations in one mutation batch |
| Path length | `4096` characters | Maximum length for source and destination path strings |

### Primary guardrail model

The path-mutation family is governed primarily by bounded batch breadth and safe path validation.

For `copy_paths`, that means the endpoint rejects or fails early when:

- the copy batch exceeds the allowed operation count,
- the source or destination path falls outside the allowed-directory scope,
- the destination already exists and `overwrite` is not enabled,
- a directory source is requested without `recursive=true`,
- the batch creates overlapping source/destination hazards.

---

## 5. Overlap-Safe Batch Execution
[INTENT: SPECIFICATION]

Before the batch runs, the endpoint validates the prepared operations for safe parallel execution.

The batch must be rejected when:

- a directory is copied into its own destination subtree,
- two operations target the same or overlapping destination paths,
- one operation writes into a path that overlaps another operation’s source path.

These checks are part of the endpoint’s owned behavior and must remain visible in local documentation because they are key to the endpoint’s safe non-destructive semantics.

---

## 6. Boundary Rules
[INTENT: CONSTRAINT]

### 6.1 Distinction from `create_directories`

`create_directories` owns directory-only creation.

`copy_paths` instead owns source-to-destination duplication and already handles missing destination parents internally.

### 6.2 Distinction from `move_paths`

`move_paths` transfers the source so it no longer remains at the original location.

`copy_paths` must be documented as non-destructive: the source remains in place.

### 6.3 Distinction from file-content mutation

`copy_paths` operates on filesystem items and path relationships.

It must not be described as content append, content replacement, diff ingestion, or line-range mutation.

---

## 7. Practical Use Guidance
[INTENT: CONSTRAINT]

Use this endpoint when the caller needs a filesystem item duplicated to a new destination while preserving the original source.

Choose another mutation surface when the real operation is:

- creating directories only,
- moving or renaming a source,
- creating or mutating file contents directly,
- deleting existing filesystem items.
