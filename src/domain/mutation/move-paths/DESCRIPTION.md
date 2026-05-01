# Description: `move_paths`
[INTENT: CONTEXT]

---

## 1. Scope Overview
[INTENT: CONTEXT]

`move_paths` is the path-mutation endpoint for source-removing relocation or rename of files or directories to destination paths.

It accepts one or more source-to-destination operations, validates both path surfaces, creates missing destination parents recursively, optionally removes existing destinations when overwrite is enabled, and renames the filesystem item so the original source no longer remains at the original path.

The endpoint is designed for:

- safe file or directory relocation,
- bounded path-mutation batches,
- explicit overwrite semantics,
- deterministic success/error summaries.

It is not a non-destructive copy endpoint and not a destination-free delete surface.

---

## 2. Architectural Register
[INTENT: REFERENCE]

| ID | Type | Description | Status |
| --- | --- | --- | --- |
| MOV-001 | REQUIREMENT | The endpoint owns source-removing move or rename semantics. | Active |
| MOV-002 | REQUIREMENT | The public request surface is the guarded `operations[]` batch contract with top-level `overwrite`. | Active |
| MOV-003 | REQUIREMENT | Missing destination parent directories are created recursively by this endpoint. | Active |
| MOV-004 | CONSTRAINT | Existing destinations are rejected unless `overwrite=true` is explicitly enabled. | Active |
| MOV-005 | CONSTRAINT | The source must exist before mutation proceeds. | Active |
| MOV-006 | INFORMATION | The result surface is a deterministic batch summary rather than preview-style output. | Active |
| MOV-007 | INFORMATION | The local documentation triplet is the endpoint-local SSOT that later root TOC surfaces should reference instead of duplicating. | Active |

---

## 3. Endpoint Architecture
[INTENT: SPECIFICATION]

### 3.1 Public request model

The public request surface is:

- `operations[]`
  - `sourcePath`
  - `destinationPath`
- optional top-level `overwrite`

The schema keeps the request bounded through:

- at least one move operation,
- a maximum of `200` operations per request,
- a maximum path length of `4096` characters per path string.

### 3.2 Validation model

Before move execution begins, the runtime:

1. checks the shared path-mutation batch budget,
2. validates each source path inside the allowed-directory scope,
3. validates each destination path for safe creation inside the allowed-directory scope,
4. confirms that the source exists,
5. inspects destination existence and applies the overwrite rule.

### 3.3 Runtime application model

For each requested operation, the runtime:

1. rejects an existing destination when `overwrite=false`,
2. removes an existing destination first when `overwrite=true`,
3. creates the destination parent directory recursively,
4. renames the source to the destination path,
5. returns a deterministic per-operation success or error line.

### 3.4 Source-removing semantics

The source no longer remains at the original path after a successful operation.

This is the defining architectural boundary between `move_paths` and `copy_paths`.

### 3.5 File, directory, and rename behavior

The same endpoint contract covers:

- file moves,
- directory moves,
- same-parent renames,
- cross-directory relocation.

There is no separate recursive flag because the endpoint relies on rename-based transfer rather than copy-style recursive expansion.

### 3.6 Result surface

The endpoint returns a deterministic batch summary through the shared batch mutation formatter.

The caller receives:

- successful move summaries per operation,
- per-operation failure details when errors occur,
- one batch-level response surface for the whole request.

---

## 4. Guardrail Model
[INTENT: CONSTRAINT]

| Guardrail surface | Active ceiling |
| --- | --- |
| Operations per request | `200` |
| Maximum path length | `4096` characters |

The path-mutation family uses bounded batch breadth, allowed-directory validation, and explicit destructive-mutation control as its primary safety model.

For `move_paths`, this model is reinforced by:

- mandatory source existence checks,
- destination-creation-aware path validation,
- explicit overwrite opt-in,
- destination replacement before rename when overwrite is enabled.

---

## 5. Mutation-Family Boundaries
[INTENT: SPECIFICATION]

### 5.1 Distinction from `create_directories`

`create_directories` owns directory-only creation.

`move_paths` instead owns relocation or rename of existing filesystem items and already creates destination parents internally when needed.

### 5.2 Distinction from `copy_paths`

`copy_paths` preserves the source in place.

`move_paths` transfers the source so it no longer remains at the original path.

### 5.3 Distinction from `delete_paths`

`delete_paths` removes targets without destination semantics.

`move_paths` is still a destination-oriented relocation surface, even though it removes the source from the original path as part of the move.

### 5.4 Distinction from file-content mutation

`move_paths` is a path-oriented endpoint.

It must not be described as append, replacement, diff ingestion, or raw content creation behavior.

---

## 6. Source-of-Truth Surfaces
[INTENT: REFERENCE]

| Surface | Role |
| --- | --- |
| [`schema.ts`](./schema.ts) | Public request-contract authority |
| [`handler.ts`](./handler.ts) | Runtime behavior authority |
| [`mutation-guardrails.ts`](../shared/mutation-guardrails.ts) | Shared path-mutation batch-budget authority |
| [`register-comparison-and-mutation-tool-catalog.ts`](../../../application/server/register-comparison-and-mutation-tool-catalog.ts) | Public registration wording authority |

---

## 7. LLM Agent Guidance
[INTENT: CONTEXT]

Use `move_paths` when the caller needs an existing filesystem item relocated or renamed and the source should no longer remain at the original path.

Do not choose this endpoint when the real objective is:

- copying while preserving the source,
- creating directories only,
- deleting targets without a destination,
- mutating file contents.

The endpoint-local conventions live in [`CONVENTIONS.md`](./CONVENTIONS.md), and the concise DX summary lives in [`README.md`](./README.md).
