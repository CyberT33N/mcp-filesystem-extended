# DESCRIPTION — `append_files` Endpoint

## Purpose

`append_files` appends caller-supplied text to one or more files and returns a concise mutation summary.

It is the additive file-end mutation surface of the public content-mutation family.

---

## Public Request Contract

The caller sends `files`, where each entry contains:

- `path`
- `content`

The current schema validates batch size, path length, and per-file content length before the handler runs.

The public registration surface exposes `append_files` as the additive append tool whose oversized payloads are refused rather than truncated.

---

## Execution Pipeline

The current additive append flow is:

1. the application catalog registers `append_files` in [`registerComparisonAndMutationToolCatalog()`](../../../application/server/register-comparison-and-mutation-tool-catalog.ts:38),
2. [`AppendFilesArgsSchema`](./schema.ts:9) validates the public `files` array,
3. [`handleAppendFiles()`](./handler.ts:25) enforces the cumulative content-bearing mutation input budget before any filesystem write begins,
4. the handler validates each requested target path,
5. the handler creates missing parent directories automatically,
6. the handler appends the caller-supplied UTF-8 content to the target file,
7. when the target file does not yet exist, the current runtime still materializes that file before appended content is written,
8. the handler returns a concise mutation summary.

This endpoint therefore owns additive append behavior, not explicit new-file-only creation and not targeted replacement.

---

## Current Runtime Behavior on Missing Targets

`append_files` is intentionally different from `create_files` when the target path does not yet exist.

- `append_files` currently materializes the target file and then writes appended content,
- `create_files` is the explicit new-file creation surface and refuses writes when the target already exists,
- `replace_file_line_ranges` remains the targeted existing-file replacement surface.

This create-if-missing runtime behavior must remain explicit in endpoint-local documentation because it is part of the current code truth.

---

## Mutation-Family Boundary

`append_files` is intentionally distinct from the nearby content-mutation surfaces.

- `append_files` appends text at file end and currently materializes missing targets.
- `create_files` creates non-existing files from full caller-supplied content and refuses existing targets.
- `replace_file_line_ranges` replaces inclusive line ranges inside existing text files.

This distinction must remain explicit in all endpoint-local documentation.

---

## Output Model

The endpoint returns a concise mutation summary rather than echoing the full caller payload.

This summary:

- records successful appends,
- records file-level failures,
- stays bounded by the shared path-mutation summary response budget.

The endpoint is therefore content-bearing on input but intentionally compact on output.

---

## Relevant Source-of-Truth Surfaces

The current endpoint contract is derived from these concrete surfaces:

- [`schema.ts`](./schema.ts)
- [`handler.ts`](./handler.ts)
- [`register-comparison-and-mutation-tool-catalog.ts`](../../../application/server/register-comparison-and-mutation-tool-catalog.ts)
- [`create-files/schema.ts`](../create-files/schema.ts)
- [`replace-file-line-ranges/schema.ts`](../replace-file-line-ranges/schema.ts)
- [`README.md`](../../../../README.md)
- [`DESCRIPTION.md`](../../../../DESCRIPTION.md)

The root TOC documents remain higher-level entry surfaces only.

---

## Local Documentation Ownership

- `CONVENTIONS.md` owns endpoint-local rules and guardrails.
- `DESCRIPTION.md` owns the detailed architecture explanation for LLM agents.
- `README.md` owns the concise developer-facing summary.

Root TOC documentation later re-references this local triplet instead of duplicating the endpoint contract.
