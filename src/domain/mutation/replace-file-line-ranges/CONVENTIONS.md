# Conventions: `replace_file_line_ranges`
[INTENT: CONSTRAINT]

---

## 1. Local SSOT Role
[INTENT: CONTEXT]

This file is the endpoint-local single source of truth for the `replace_file_line_ranges` conventions and guardrails.

It owns the rules for:

- targeted existing-file replacement scope,
- 1-based inclusive line-range semantics,
- the canonical `replacementText` payload surface,
- preview and write behavior,
- family-boundary distinctions from additive creation and append operations.

The endpoint-local architecture description lives in [`DESCRIPTION.md`](./DESCRIPTION.md), and the concise developer-facing summary lives in [`README.md`](./README.md).

---

## 2. Canonical Request Surface
[INTENT: REFERENCE]

| Surface | Rule |
| --- | --- |
| Tool name | `replace_file_line_ranges` |
| Batch container | `files[]` |
| Per-file fields | `path`, `replacements[]` |
| Per-replacement fields | `startLine`, `endLine`, `replacementText` |
| Preview flag | `dryRun` |
| File scope | Existing text files only |

### Canonical Same-Concept Rule
[INTENT: CONSTRAINT]

The replacement payload is named `replacementText` from schema to runtime.

Do not rename this same-concept surface to:

- `content`
- `patch`
- `diff`
- `text`

This endpoint accepts direct replacement text, not unified diff patch text.

---

## 3. Inclusive Line-Range Semantics
[INTENT: CONSTRAINT]

### 3.1 Range model

- `startLine` is a 1-based inclusive start line.
- `endLine` is a 1-based inclusive end line.
- `startLine` and `endLine` must both be integers greater than or equal to `1`.
- `endLine` must be greater than or equal to `startLine`.
- `endLine` must not exceed the current line count of the target file.

### 3.2 Replacement ordering

Runtime application sorts replacements in descending `startLine` order before applying them.

This preserves the intended coordinates for earlier ranges while later ranges are being rewritten.

### 3.3 Text normalization and indentation behavior

- The runtime normalizes line endings before replacement and preview generation.
- When indentation preservation is enabled, the first inserted line inherits the indentation of the first replaced line.
- Additional inserted lines keep the indentation supplied by the caller inside `replacementText`.

---

## 4. Guardrails and Budgets
[INTENT: CONSTRAINT]

| Surface | Limit | Meaning |
| --- | --- | --- |
| Files per request | `50` | Maximum `files[]` entries in one request |
| Replacements per file | `25` | Maximum `replacements[]` entries for one file |
| Path length | `4096` characters | Maximum length for one target path |
| Single `replacementText` payload | `100000` characters | Maximum size of one replacement payload |
| Cumulative `replacementText` input | `300000` characters | Maximum total replacement text across the whole request |
| Preview output budget | `300000` characters | Maximum diff-style preview output before refusal |

### Refusal model

The endpoint refuses requests when:

- a request exceeds the cumulative `replacementText` budget,
- a preview result exceeds the file-diff family output cap,
- a line range is invalid for the current target file,
- a target path is outside the allowed directory scope.

When a request is refused because of size, reduce the replacement scope instead of treating the endpoint as an unbounded write surface.

---

## 5. Preview and Write Behavior
[INTENT: SPECIFICATION]

### 5.1 `dryRun` behavior

- `dryRun: true` computes the replacement preview without writing files.
- `dryRun: false` uses the same validated replacement flow and writes the modified file only after preview construction and budget checks succeed.

### 5.2 Preview surface

Successful preview output is composed from:

- a fenced unified diff preview, and
- a replacement-details section that reports per-range application status.

### 5.3 Multi-file result behavior

Batch execution is file-scoped.

- successful files contribute replacement results,
- failed files contribute error entries,
- one failing file does not automatically erase successful results from other files in the same request.

---

## 6. Boundary Rules
[INTENT: CONSTRAINT]

### 6.1 This endpoint is not additive creation

Do not document `replace_file_line_ranges` as:

- a new-file creation surface,
- an additive create-if-missing workflow,
- a generic overwrite endpoint.

That role belongs to `create_files`.

### 6.2 This endpoint is not append-at-end mutation

Do not document `replace_file_line_ranges` as:

- an end-of-file append surface,
- a general text-growth endpoint.

That role belongs to `append_files`.

### 6.3 This endpoint is a targeted in-place edit surface

Document it as the bounded existing-file mutation surface for direct 1-based inclusive line-range replacement.

---

## 7. Practical Use Guidance
[INTENT: CONSTRAINT]

Use this endpoint when the caller already knows the exact existing file and the exact line ranges that must be replaced.

Choose another mutation surface when the real need is:

- creating a new text file,
- appending text at file end,
- sending unified diff patch text,
- performing broad whole-file rewriting without line-range coordinates.
