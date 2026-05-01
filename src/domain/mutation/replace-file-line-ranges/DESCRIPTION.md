# Description: `replace_file_line_ranges`
[INTENT: CONTEXT]

---

## 1. Scope Overview
[INTENT: CONTEXT]

`replace_file_line_ranges` is the targeted content-mutation endpoint for bounded in-place edits to existing text files.

It accepts one or more files, each with one or more 1-based inclusive line-range replacements, and applies direct `replacementText` payloads instead of unified diff patch text.

The endpoint is designed for:

- exact existing-file replacements,
- bounded previewable edits,
- request-shape validation before mutation,
- guardrail-enforced preview and write flows.

It is not the additive creation surface and not the additive append-at-end surface.

---

## 2. Architectural Register
[INTENT: REFERENCE]

| ID | Type | Description | Status |
| --- | --- | --- | --- |
| RFLR-001 | REQUIREMENT | The endpoint owns direct 1-based inclusive line-range replacement for existing text files. | Active |
| RFLR-002 | REQUIREMENT | The canonical per-replacement payload surface is `replacementText`. | Active |
| RFLR-003 | REQUIREMENT | `dryRun` previews the replacement result without writing files. | Active |
| RFLR-004 | CONSTRAINT | The endpoint must not be described as additive file creation, additive append, or unified diff patch ingestion. | Active |
| RFLR-005 | CONSTRAINT | Request-shape and runtime budgets must remain bounded by shared guardrail constants. | Active |
| RFLR-006 | INFORMATION | Replacement previews are shaped as diff-style output plus replacement-detail reporting. | Active |
| RFLR-007 | INFORMATION | The local documentation triplet is the endpoint-local SSOT that later root TOC surfaces should reference instead of duplicating. | Active |

---

## 3. Endpoint Architecture
[INTENT: SPECIFICATION]

### 3.1 Public request model

The public request surface is shaped as:

- `files[]`
  - `path`
  - `replacements[]`
    - `startLine`
    - `endLine`
    - `replacementText`
- optional `dryRun`

The range model is 1-based and inclusive.

The endpoint uses direct replacement text and does not accept patch-format input.

### 3.2 Validation model

The endpoint validates:

- target path scope against allowed directories,
- per-request file count,
- per-file replacement count,
- per-replacement `replacementText` size,
- cumulative `replacementText` size across the request,
- line-range correctness against the current target file.

An invalid range fails when:

- `startLine < 1`,
- `endLine < startLine`, or
- `endLine` exceeds the current file line count.

### 3.3 Runtime application model

For each file, the runtime:

1. reads and normalizes the file content,
2. splits the file into lines,
3. sorts replacements in descending `startLine` order,
4. validates each inclusive range,
5. normalizes the supplied `replacementText`,
6. optionally preserves indentation on the first inserted line,
7. applies the replacements,
8. builds a unified diff preview,
9. enforces the preview output cap,
10. writes the file only when `dryRun` is `false`.

### 3.4 Preview and result surface

The successful result surface is human-readable rather than structured JSON.

It includes:

- a processed-file summary,
- an error section when some files fail,
- a diff-style replacement result section for successful files,
- per-replacement status lines inside each successful file result.

The preview output stays inside the file-diff family cap, which keeps large previews bounded before the server-level response fuse would be the only remaining safeguard.

### 3.5 Batch behavior

The endpoint is batch-capable across files.

Each file is processed independently inside the request.
This means one file can fail validation or replacement while other files in the same request still succeed and return preview output.

---

## 4. Guardrail Model
[INTENT: CONSTRAINT]

| Guardrail surface | Active ceiling |
| --- | --- |
| Files per request | `50` |
| Replacements per file | `25` |
| Single `replacementText` payload | `100000` characters |
| Cumulative `replacementText` request budget | `300000` characters |
| Preview output budget | `300000` characters |

These ceilings exist to preserve targeted-edit semantics.

The endpoint is intentionally more constrained than a generic raw-content mutation surface because line-range replacement should stay bounded and previewable.

---

## 5. Mutation-Family Boundaries
[INTENT: SPECIFICATION]

### 5.1 Distinction from `create_files`

`create_files` owns additive new-file creation.

`replace_file_line_ranges` instead assumes an already existing text file and replaces selected inclusive line ranges within that file.

### 5.2 Distinction from `append_files`

`append_files` owns additive file-end writes.

`replace_file_line_ranges` instead targets explicit coordinates inside the current file body and produces a diff-style preview surface.

### 5.3 Distinction from patch-text workflows

This endpoint does not accept unified diff patch text as input.

The caller must provide direct `replacementText` for each bounded line-range operation.

---

## 6. Source-of-Truth Surfaces
[INTENT: REFERENCE]

| Surface | Role |
| --- | --- |
| `src/domain/mutation/replace-file-line-ranges/schema.ts` | Public request-contract authority |
| `src/domain/mutation/replace-file-line-ranges/handler.ts` | Runtime handler authority |
| `src/domain/mutation/replace-file-line-ranges/helpers.ts` | Replacement-application and preview-generation authority |
| `src/domain/shared/guardrails/tool-guardrail-limits.ts` | Shared guardrail and family-budget authority |
| `src/application/server/register-comparison-and-mutation-tool-catalog.ts` | Public registration wording authority |

---

## 7. LLM Agent Guidance
[INTENT: CONTEXT]

Use `replace_file_line_ranges` when the caller has all of the following:

- an existing text file,
- exact target line coordinates,
- replacement content that should be inserted directly,
- a need for bounded preview or bounded in-place modification.

Do not choose this endpoint when the real operation is:

- creating a new text file,
- appending text at the end of a file,
- sending unified diff patch text,
- performing an unconstrained whole-file rewrite without explicit line ranges.

The endpoint-local conventions live in [`CONVENTIONS.md`](./CONVENTIONS.md), and the concise DX summary lives in [`README.md`](./README.md).
