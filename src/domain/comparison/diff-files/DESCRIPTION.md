# DESCRIPTION — `diff_files` Endpoint

## Purpose

`diff_files` compares one or more pairs of files that already exist on disk and returns unified diff output.

It is the file-backed comparison surface of the public comparison family.

---

## Public Request Contract

The caller sends `pairs`, where each pair contains:

- `leftPath`
- `rightPath`

The current schema accepts one or more pairs, validates the pair count against the comparison family cap, and constrains the caller path strings before the handler runs.

The public registration surface exposes `diff_files` as the on-disk unified-diff tool.

---

## Execution Pipeline

The current file-backed comparison flow is:

1. the application catalog registers `diff_files` in `src/application/server/register-comparison-and-mutation-tool-catalog.ts`,
2. `src/domain/comparison/diff-files/schema.ts` validates the public `pairs` array,
3. `src/domain/comparison/diff-files/handler.ts` validates both file paths against the allowed directories,
4. the handler reads both files from disk and generates a unified diff,
5. the file-backed diff family response budget is enforced before the result leaves the endpoint.

This endpoint therefore depends on validated on-disk sources, not on caller-supplied raw text.

---

## Output Model

### Single pair

- returns unified diff output for the requested pair,
- or returns `Files are identical.` when the diff is empty after comparison.

### Multiple pairs

- processes each pair independently,
- keeps successful results and per-pair failures inside one batch-formatted text surface,
- preserves the pair label `<leftPath> ↔ <rightPath>` for each batch item.

This endpoint is text-result oriented. It does not move primary comparison data into a structured-content-only surface.

---

## Comparison-Family Boundary

`diff_files` is intentionally distinct from `diff_text_content`.

- `diff_files` uses files that already exist on disk.
- `diff_text_content` uses caller-supplied in-memory text.
- `diff_files` follows the file-backed diff budget model.
- `diff_text_content` follows the stricter raw-text caller-input budget model.

This distinction must remain explicit in all endpoint-local documentation.

---

## Relevant Source-of-Truth Surfaces

The current endpoint contract is derived from these concrete surfaces:

- `src/domain/comparison/diff-files/handler.ts`
- `src/domain/comparison/diff-files/schema.ts`
- `src/application/server/register-comparison-and-mutation-tool-catalog.ts`
- `conventions/guardrails/overview.md`
- `conventions/guardrails/mcp-client-governance.md`
- `conventions/mcp-response-contract/structured-content-contract.md`

The root TOC documents `README.md`, `DESCRIPTION.md`, and `CONVENTIONS.md` remain higher-level entry surfaces only.

---

## Local Documentation Ownership

- `CONVENTIONS.md` owns endpoint-local rules and guardrails.
- `DESCRIPTION.md` owns the detailed architecture explanation for LLM agents.
- `README.md` owns the concise developer-facing summary.

Root TOC documentation later re-references this local triplet instead of duplicating the endpoint contract.
