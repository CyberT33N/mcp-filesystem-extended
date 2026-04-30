# DESCRIPTION — `diff_text_content` Endpoint

## Purpose

`diff_text_content` compares one or more caller-supplied in-memory text pairs and returns unified diff output.

It is the raw-text comparison surface of the public comparison family.

---

## Public Request Contract

The caller sends `pairs`, where each pair contains:

- `leftContent`
- `rightContent`
- optional `leftLabel`
- optional `rightLabel`

The current schema accepts one or more pairs, validates the pair count against the raw-text diff family cap, constrains each content string through the shared raw-content schema budget, and supplies default labels when the caller omits them.

The public registration surface exposes `diff_text_content` as the in-memory raw-text diff tool.

---

## Execution Pipeline

The current raw-text comparison flow is:

1. the application catalog registers `diff_text_content` in [`registerComparisonAndMutationToolCatalog()`](src/application/server/register-comparison-and-mutation-tool-catalog.ts:38),
2. [`DiffTextContentArgsSchema`](src/domain/comparison/diff-text-content/schema.ts:8) validates the public `pairs` array,
3. [`handleContentDiff()`](src/domain/comparison/diff-text-content/handler.ts:90) rejects oversized cumulative raw-text input before unified diff generation begins,
4. the handler generates one or more unified diff blocks from the caller-supplied in-memory text pairs,
5. the text-diff family response budget is enforced before the result leaves the endpoint.

This endpoint therefore depends on caller-supplied in-memory text, not on disk reads or path validation.

---

## Output Model

### Single pair

- returns unified diff output for the supplied pair,
- preserves the caller-visible or default labels in the diff headers.

### Multiple pairs

- processes each pair independently,
- keeps successful results and per-pair failures inside one batch-formatted text surface,
- preserves the pair label `<leftLabel> ↔ <rightLabel> (#N)` for each batch item.

This endpoint is text-result oriented. It does not move primary comparison data into a structured-content-only surface.

---

## Budget Model

`diff_text_content` is intentionally stricter than [`diff_files`](../diff-files/README.md) because callers can inject arbitrary raw text directly into the request.

The current budget model therefore has two relevant layers:

1. schema-layer and preflight limits on caller-supplied text input,
2. a text-diff family response cap on the emitted unified diff output.

The currently relevant local limits are:

- cumulative input: `MAX_TOTAL_RAW_TEXT_REQUEST_CHARS = 400,000`
- output family cap: `TEXT_DIFF_RESPONSE_CAP_CHARS = 240,000`

When these budgets are exceeded, callers must reduce pair count or shorten the compared content instead of expecting the endpoint to stream or silently truncate raw-text diffs.

---

## Comparison-Family Boundary

`diff_text_content` is intentionally distinct from [`diff_files`](../diff-files/README.md).

- `diff_text_content` uses caller-supplied in-memory text.
- `diff_files` uses files that already exist on disk.
- `diff_text_content` follows the stricter raw-text caller-input budget model.
- `diff_files` follows the file-backed diff budget model.

This distinction must remain explicit in all endpoint-local documentation.

---

## Relevant Source-of-Truth Surfaces

The current endpoint contract is derived from these concrete surfaces:

- [`handler.ts`](./handler.ts)
- [`schema.ts`](./schema.ts)
- [`register-comparison-and-mutation-tool-catalog.ts`](../../../application/server/register-comparison-and-mutation-tool-catalog.ts)
- [`6.1-diff-files-doc-set.md`](../../../../.plan/6-comparison-docs/6.1-diff-files-doc-set.md)
- [Guardrails Overview](../../../../conventions/guardrails/overview.md)
- [MCP Client Governance](../../../../conventions/guardrails/mcp-client-governance.md)
- [Structured Content Contract](../../../../conventions/mcp-response-contract/structured-content-contract.md)

The root TOC documents [`README.md`](../../../../README.md), [`DESCRIPTION.md`](../../../../DESCRIPTION.md), and [`CONVENTIONS.md`](../../../../CONVENTIONS.md) remain higher-level entry surfaces only.

---

## Local Documentation Ownership

- `CONVENTIONS.md` owns endpoint-local rules and guardrails.
- `DESCRIPTION.md` owns the detailed architecture explanation for LLM agents.
- `README.md` owns the concise developer-facing summary.

Root TOC documentation later re-references this local triplet instead of duplicating the endpoint contract.
