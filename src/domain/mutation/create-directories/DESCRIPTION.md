# Description: `create_directories`
[INTENT: CONTEXT]

---

## 1. Scope Overview
[INTENT: CONTEXT]

`create_directories` is the path-mutation endpoint for idempotent creation of one or more directory paths.

It accepts a guarded batch of directory paths, validates each one for safe creation, and materializes the requested directories with recursive parent creation enabled.

The endpoint is designed for:

- standalone directory creation,
- bounded path-mutation batches,
- safe creation inside allowed-directory boundaries,
- deterministic success/error summaries.

It is not a file-creation endpoint and not a source-to-destination copy or move surface.

---

## 2. Architectural Register
[INTENT: REFERENCE]

| ID | Type | Description | Status |
| --- | --- | --- | --- |
| CDIR-001 | REQUIREMENT | The endpoint owns creation of one or more directory paths, including missing parents. | Active |
| CDIR-002 | REQUIREMENT | The public request surface is the guarded `paths[]` batch contract. | Active |
| CDIR-003 | REQUIREMENT | Each requested path must pass creation-time path validation before mutation begins. | Active |
| CDIR-004 | CONSTRAINT | The endpoint must not be documented as file creation, copy, or move behavior. | Active |
| CDIR-005 | CONSTRAINT | Batch-size guardrails remain enforced server-side before filesystem mutation starts. | Active |
| CDIR-006 | INFORMATION | The result surface is a deterministic batch summary rather than content-bearing preview output. | Active |
| CDIR-007 | INFORMATION | The local documentation triplet is the endpoint-local SSOT that later root TOC surfaces should reference instead of duplicating. | Active |

---

## 3. Endpoint Architecture
[INTENT: SPECIFICATION]

### 3.1 Public request model

The public request surface is:

- `paths[]`

Each item is a directory path to create.

The schema keeps the request bounded through:

- at least one requested path,
- a maximum of `200` paths per request,
- a maximum path length of `4096` characters.

### 3.2 Validation model

Before any directory is created, the runtime:

1. checks the batch size through the shared path-mutation batch budget,
2. validates each path for safe creation inside the allowed-directory scope,
3. rejects unsafe or invalid creation targets before they can widen the mutation blast radius.

### 3.3 Runtime application model

For each requested directory path, the runtime:

1. validates the path for creation,
2. resolves the safe target path,
3. calls `fs.mkdir(..., { recursive: true })`,
4. records a success or error result for the deterministic batch summary.

Recursive parent creation is part of the endpoint’s owned behavior, not an external prerequisite.

### 3.4 Idempotent semantics

Because recursive directory creation is enabled, the endpoint provides idempotent directory creation semantics for already-existing directory paths instead of requiring callers to pre-check every target manually.

### 3.5 Result surface

The endpoint returns a deterministic batch summary through the shared batch-result formatter.

The caller receives:

- the number of successful directory creations,
- whether failures occurred,
- per-directory failure details when errors are present.

This endpoint does not return content previews or diffs because the mutation surface is path-oriented.

---

## 4. Guardrail Model
[INTENT: CONSTRAINT]

| Guardrail surface | Active ceiling |
| --- | --- |
| Paths per request | `200` |
| Maximum path length | `4096` characters |

The path-mutation family uses bounded batch size and path validation as the primary safety model.

This keeps directory creation workloads constrained before broad path-mutation requests can expand into unstable blast-radius territory.

---

## 5. Mutation-Family Boundaries
[INTENT: SPECIFICATION]

### 5.1 Distinction from `create_files`

`create_files` owns additive creation of new text files together with caller-supplied content.

`create_directories` instead owns directory-path creation only.

### 5.2 Distinction from `copy_paths`

`copy_paths` owns source-to-destination duplication.

Its public contract already states that missing destination parent directories are created recursively by that tool, so a caller does not need `create_directories` as a prerequisite when the real goal is copy.

### 5.3 Distinction from `move_paths`

`move_paths` owns source-to-destination relocation or rename behavior.

Its public contract also creates missing destination parent directories recursively, so a caller does not need `create_directories` as a prerequisite when the real goal is move.

---

## 6. Source-of-Truth Surfaces
[INTENT: REFERENCE]

| Surface | Role |
| --- | --- |
| `src/domain/mutation/create-directories/schema.ts` | Public request-contract authority |
| `src/domain/mutation/create-directories/handler.ts` | Runtime behavior authority |
| `src/application/server/register-comparison-and-mutation-tool-catalog.ts` | Public registration wording authority |
| `src/domain/mutation/copy-paths/schema.ts` | Contrast authority for internal destination-parent creation in copy workflows |
| `src/domain/mutation/move-paths/schema.ts` | Contrast authority for internal destination-parent creation in move workflows |

---

## 7. LLM Agent Guidance
[INTENT: CONTEXT]

Use `create_directories` when the caller needs directories to exist as directories and no copy, move, or file-content mutation is actually intended.

Do not choose this endpoint when the real objective is:

- creating files with content,
- copying existing filesystem items,
- moving or renaming filesystem items,
- mutating file contents.

The endpoint-local conventions live in [`CONVENTIONS.md`](./CONVENTIONS.md), and the concise DX summary lives in [`README.md`](./README.md).
