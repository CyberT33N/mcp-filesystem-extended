# Description: `copy_paths`
[INTENT: CONTEXT]

---

## 1. Scope Overview
[INTENT: CONTEXT]

`copy_paths` is the path-mutation endpoint for non-destructive duplication of files or directories to new destinations.

It accepts one or more source-to-destination operations, validates both path surfaces, creates missing destination parents recursively, and copies the requested filesystem items while keeping the source in place.

The endpoint is designed for:

- safe file or directory duplication,
- bounded path-mutation batches,
- overlap-aware parallel execution planning,
- deterministic success/error summaries.

It is not a move/rename endpoint and not a directory-only creation endpoint.

---

## 2. Architectural Register
[INTENT: REFERENCE]

| ID | Type | Description | Status |
| --- | --- | --- | --- |
| CPY-001 | REQUIREMENT | The endpoint owns non-destructive source-to-destination copy semantics. | Active |
| CPY-002 | REQUIREMENT | The public request surface is the guarded `operations[]` batch contract. | Active |
| CPY-003 | REQUIREMENT | Missing destination parent directories are created recursively by this endpoint. | Active |
| CPY-004 | REQUIREMENT | Directory sources require `recursive=true`. | Active |
| CPY-005 | CONSTRAINT | Existing destinations are rejected unless `overwrite=true` is explicitly enabled. | Active |
| CPY-006 | CONSTRAINT | Overlapping source/destination hazards must be rejected before unsafe batch execution begins. | Active |
| CPY-007 | INFORMATION | The local documentation triplet is the endpoint-local SSOT that later root TOC surfaces should reference instead of duplicating. | Active |

---

## 3. Endpoint Architecture
[INTENT: SPECIFICATION]

### 3.1 Public request model

The public request surface is:

- `operations[]`
  - `sourcePath`
  - `destinationPath`
  - optional `recursive`
  - optional `overwrite`

The schema keeps the request bounded through:

- at least one copy operation,
- a maximum of `200` operations per request,
- a maximum path length of `4096` characters per path string.

### 3.2 Validation model

Before copy begins, the runtime:

1. checks the shared path-mutation batch budget,
2. validates each source path inside the allowed-directory scope,
3. validates each destination path for safe creation inside the allowed-directory scope,
4. prepares all operations before execution,
5. runs overlap-safety checks across the prepared batch.

### 3.3 Runtime application model

For each prepared operation, the runtime:

1. inspects the source filesystem item,
2. creates the destination parent directory recursively,
3. rejects existing destinations unless `overwrite=true`,
4. requires `recursive=true` for directory sources,
5. copies directories recursively or copies files directly,
6. returns a deterministic per-operation success or error result.

### 3.4 Non-destructive semantics

The source remains in place after the operation.

This is the defining architectural boundary between `copy_paths` and `move_paths`.

### 3.5 Overlap-safe batch execution

The endpoint rejects unsafe parallel copy plans before mutation begins.

The safety layer refuses batches where:

- a directory would be copied into its own destination subtree,
- two copy operations target the same or overlapping destination paths,
- one operation writes into a path that overlaps another operation’s source path.

### 3.6 Result surface

The endpoint returns a deterministic batch summary through the shared batch text formatter.

The caller receives:

- successful copy summaries per operation,
- per-operation failure details when errors occur,
- one batch-level response surface for the whole request.

---

## 4. Guardrail Model
[INTENT: CONSTRAINT]

| Guardrail surface | Active ceiling |
| --- | --- |
| Operations per request | `200` |
| Maximum path length | `4096` characters |

The path-mutation family uses bounded batch breadth and safe path validation as its primary safety model.

For `copy_paths`, this model is reinforced by overlap-safe batch planning before the endpoint performs any potentially conflicting parallel copy work.

---

## 5. Mutation-Family Boundaries
[INTENT: SPECIFICATION]

### 5.1 Distinction from `create_directories`

`create_directories` owns directory-only creation.

`copy_paths` instead owns duplication of existing filesystem items and already creates destination parents internally when needed.

### 5.2 Distinction from `move_paths`

`move_paths` transfers the source so it no longer remains at the original path.

`copy_paths` must be documented as non-destructive: the source remains in place after the operation.

### 5.3 Distinction from file-content mutation

`copy_paths` is a path-oriented endpoint.

It must not be described as append, replacement, diff ingestion, or raw content creation behavior.

---

## 6. Source-of-Truth Surfaces
[INTENT: REFERENCE]

| Surface | Role |
| --- | --- |
| `src/domain/mutation/copy-paths/schema.ts` | Public request-contract authority |
| `src/domain/mutation/copy-paths/handler.ts` | Runtime behavior authority |
| `src/domain/mutation/copy-paths/helpers.ts` | Overlap-safe batch-planning and recursive directory-copy authority |
| `src/domain/mutation/shared/mutation-guardrails.ts` | Shared path-mutation batch-budget authority |
| `src/application/server/register-comparison-and-mutation-tool-catalog.ts` | Public registration wording authority |

---

## 7. LLM Agent Guidance
[INTENT: CONTEXT]

Use `copy_paths` when the caller needs an existing filesystem item duplicated to a new destination while preserving the original source.

Do not choose this endpoint when the real objective is:

- creating directories only,
- moving or renaming a source,
- mutating file contents,
- deleting paths.

The endpoint-local conventions live in [`CONVENTIONS.md`](./CONVENTIONS.md), and the concise DX summary lives in [`README.md`](./README.md).
