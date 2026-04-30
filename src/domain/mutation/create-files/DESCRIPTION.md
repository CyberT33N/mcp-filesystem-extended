# DESCRIPTION — `create_files` Endpoint

## Purpose

`create_files` creates one or more new text files from caller-supplied content and returns a concise mutation summary.

It is the additive new-file materialization surface of the public content-mutation family.

---

## Public Request Contract

The caller sends `files`, where each entry contains:

- `path`
- `content`

The current schema validates the batch size, path length, and per-file content length before the handler runs.

The public registration surface exposes `create_files` as the new-file creation tool whose oversized payloads are refused rather than truncated.

---

## Execution Pipeline

The current additive creation flow is:

1. the application catalog registers `create_files` in [`registerComparisonAndMutationToolCatalog()`](../../../application/server/register-comparison-and-mutation-tool-catalog.ts:38),
2. [`CreateFilesArgsSchema`](./schema.ts:9) validates the public `files` array,
3. [`handleCreateFiles()`](./handler.ts:25) enforces the cumulative content-bearing mutation input budget before any filesystem write begins,
4. the handler validates each requested path for creation,
5. the handler refuses the write if the target file already exists,
6. the handler creates missing parent directories automatically,
7. the handler writes the caller-supplied UTF-8 content and returns a concise mutation summary.

This endpoint therefore owns additive new-file creation, not modification of existing files.

---

## Existing-File Refusal Semantics

`create_files` is intentionally strict about target existence.

- non-existing targets are eligible for creation,
- already existing targets are refused,
- refusal is explicit rather than silently degrading into overwrite behavior.

This is a core architectural boundary of the endpoint.

---

## Mutation-Family Boundary

`create_files` is intentionally distinct from the nearby content-mutation surfaces.

- `create_files` creates non-existing files from full caller-supplied content.
- `append_files` appends content to existing files.
- `replace_file_line_ranges` replaces inclusive line ranges inside existing text files.

This distinction must remain explicit in all endpoint-local documentation.

---

## Output Model

The endpoint returns a concise mutation summary rather than echoing the full caller payload.

This summary:

- records successful creates,
- records file-level failures,
- stays bounded by the mutation-summary response budget.

The endpoint is therefore content-bearing on input but intentionally compact on output.

---

## Relevant Source-of-Truth Surfaces

The current endpoint contract is derived from these concrete surfaces:

- [`schema.ts`](./schema.ts)
- [`handler.ts`](./handler.ts)
- [`register-comparison-and-mutation-tool-catalog.ts`](../../../application/server/register-comparison-and-mutation-tool-catalog.ts)
- [`append-files/schema.ts`](../append-files/schema.ts)
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
