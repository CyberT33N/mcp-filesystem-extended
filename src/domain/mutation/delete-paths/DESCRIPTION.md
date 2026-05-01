# Description: `delete_paths`
[INTENT: CONTEXT]

---

## 1. Scope Overview
[INTENT: CONTEXT]

`delete_paths` is the path-mutation endpoint for destructive removal of files or directories from validated filesystem locations.

It accepts one or more target paths, validates every requested target inside the allowed-directory scope, deletes files directly, deletes directories only when `recursive=true` is explicitly enabled, and returns a deterministic batch summary.

The endpoint is designed for:

- destructive file removal,
- explicit recursive directory deletion,
- bounded path-mutation batches,
- deterministic success/error summaries.

It is not a copy endpoint, not a move endpoint, and not an in-place rewrite surface.

---

## 2. Architectural Register
[INTENT: REFERENCE]

| ID | Type | Description | Status |
| --- | --- | --- | --- |
| DEL-001 | REQUIREMENT | The endpoint owns destructive target removal semantics. | Active |
| DEL-002 | REQUIREMENT | The public request surface is the guarded `paths[]` batch contract with top-level `recursive`. | Active |
| DEL-003 | REQUIREMENT | Files are deleted directly, while directories require explicit recursive intent. | Active |
| DEL-004 | CONSTRAINT | The endpoint must not be documented as copy, move, destination-creation, or content-mutation behavior. | Active |
| DEL-005 | CONSTRAINT | Batch-size and blast-radius limits remain enforced server-side before deletion begins. | Active |
| DEL-006 | INFORMATION | The result surface is a deterministic batch summary rather than preview-style output. | Active |
| DEL-007 | INFORMATION | The local documentation triplet is the endpoint-local SSOT that later root TOC surfaces should reference instead of duplicating. | Active |

---

## 3. Endpoint Architecture
[INTENT: SPECIFICATION]

### 3.1 Public request model

The public request surface is:

- `paths[]`
- optional top-level `recursive`

The schema keeps the request bounded through:

- at least one deletion target,
- a maximum of `200` targets per request,
- a maximum path length of `4096` characters per target string.

### 3.2 Validation model

Before deletion begins, the runtime:

1. checks the shared path-mutation batch budget,
2. validates each target path inside the allowed-directory scope,
3. inspects the filesystem target to determine whether it is a file or directory,
4. enforces the recursive-directory rule before any destructive deletion happens.

### 3.3 Runtime application model

For each requested target, the runtime:

1. validates the target path,
2. loads filesystem stats for the resolved path,
3. deletes directories only when `recursive=true`,
4. deletes files directly with unlink semantics,
5. returns a deterministic per-target success or error line.

### 3.4 Destructive semantics

This endpoint removes the requested target.

It does not preserve the source, does not create destinations, and does not relocate paths.

### 3.5 Result surface

The endpoint returns a deterministic batch summary through the shared batch mutation formatter.

The caller receives:

- successful deletion summaries per target,
- per-target failure details when errors occur,
- one batch-level response surface for the whole request.

---

## 4. Guardrail Model
[INTENT: CONSTRAINT]

| Guardrail surface | Active ceiling |
| --- | --- |
| Paths per request | `200` |
| Maximum path length | `4096` characters |

The path-mutation family uses bounded batch breadth, allowed-directory validation, and destructive-operation control as its primary safety model.

For `delete_paths`, this model is reinforced by:

- explicit recursive opt-in for directories,
- target-by-target scope validation,
- refusal of oversized deletion batches before mutation begins.

---

## 5. Mutation-Family Boundaries
[INTENT: SPECIFICATION]

### 5.1 Distinction from `copy_paths`

`copy_paths` preserves the source and writes a destination.

`delete_paths` removes targets and has no destination semantics.

### 5.2 Distinction from `move_paths`

`move_paths` relocates a source to a destination path and may remove an existing destination when overwrite is enabled.

`delete_paths` performs removal-only mutation and does not expose relocation or overwrite semantics.

### 5.3 Distinction from file-content mutation

`delete_paths` is a path-oriented endpoint.

It must not be described as append, replacement, diff ingestion, line-range mutation, or rewrite behavior.

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

Use `delete_paths` when the caller needs existing filesystem items removed and the operation is intentionally destructive.

Do not choose this endpoint when the real objective is:

- preserving the source while duplicating it,
- relocating or renaming a source,
- creating directories only,
- mutating file contents.

The endpoint-local conventions live in [`CONVENTIONS.md`](./CONVENTIONS.md), and the concise DX summary lives in [`README.md`](./README.md).
