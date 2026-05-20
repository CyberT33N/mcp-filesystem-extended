# CONVENTIONS — `read_files_with_line_numbers` Endpoint

## Endpoint-Local SSOT Role

This file is the endpoint-local single source of truth for the non-obvious conventions, guardrails, and architectural boundaries of `read_files_with_line_numbers`.

Shared cross-family rules remain owned by the workspace-level conventions index and the shared guardrail slices, especially [`public-limit-disclosure-governance.md`](../../../../conventions/guardrails/public-limit-disclosure-governance.md). This file does not duplicate the full global disclosure tree. It explains how that policy applies specifically to the batch full-read surface.

---

## Architectural Principle: Content Fidelity (1:1 Guarantee)

The `read_files_with_line_numbers` endpoint guarantees **100% verbatim, lossless content reproduction** for all files in every batch request. No transformation, normalization, trimming, or whitespace modification is applied to the decoded file content at any point in the pipeline.

This guarantee is enforced at the infrastructure level:

- `readFile()` reads raw bytes from the filesystem without any modification.
- The shared inspection pipeline resolves one supported text encoding before decoded text is emitted to the caller-facing surface.
- `formatLineNumberedTextContent` applies only additive prefix annotation (`N: `) per line — the original line content is never modified.
- terminal EOF newline state is surfaced separately via `endsWithNewline` instead of inventing an extra numbered empty line.

The visual appearance of indentation or whitespace in MCP client UIs is a rendering concern, not a transport concern. See `DESCRIPTION.md` for the troubleshooting section on MCP client rendering artifacts.

---

## Architectural Principle: Mandatory Inline Line-Number Annotation

All content returned by this endpoint is annotated with **inline one-based absolute line-number prefixes** on every line. This is not configurable and is applied unconditionally to every file in every batch request.

### Rationale: LLM Agent Anti-Hallucination Architecture

LLM agents operate in an iterative context accumulation process. The context window persists across many turns within a session. When an agent reads file content in Turn N and subsequently attempts a patch operation, a targeted search, or any reference to a specific location in Turn N+X, it must resolve precise line numbers.

Without inline line-number context, the agent is forced to recount from the top of the file or estimate an offset — operations that introduce hallucination risk at exactly the most critical workflow stage: source-modifying operations such as `apply_patch`, `replace_file_line_ranges`, or targeted `search_file_contents_by_regex`.

Inline line numbers eliminate this failure mode by making every line self-describing within the agent's context window.

### Format

Each file section first exposes `endsWithNewline: <boolean>` and then prefixes every addressable line with its one-based absolute file position followed by `: ` and then the original line content:

```
endsWithNewline: true
1: import fs from "fs/promises";
2: import path from "path";
3:
4: export function example(): void {
5:   console.log("hello");
6: }
```

The prefix is purely additive. The original line content — including all leading whitespace, tabs, and indentation — is reproduced exactly after the `N: ` prefix. A trailing newline does not create an extra numbered phantom line.

### Relationship to `read_file_content`

This endpoint does not use a different infrastructure path than `read_file_content`. Both endpoints call the same underlying `readValidatedFullTextFile` function from `@infrastructure/filesystem/text-read-core`. The `formatLineNumberedTextContent` function is also defined in that same infrastructure module and is shared between the two endpoints.

The distinction is that `read_files_with_line_numbers` always applies `formatLineNumberedTextContent`, while `read_file_content` applies it only in the `full` and `line_range` modes where it is semantically correct. See the `CONVENTIONS.md` file in the `read-file-content` endpoint directory for the full mode-by-mode rationale.

### Why This Cannot Be Made Optional

Making line-number annotation opt-in would undermine its purpose. An LLM agent that does not request line numbers but then attempts a patch operation is in a worse position than one that always receives line numbers — because the omission is invisible in the context window. Mandatory annotation ensures that every agent context that includes this endpoint's output is structurally equipped for precise line-level targeting without requiring the orchestrating prompt to explicitly request it.

---

## Architectural Principle: Public Limit Disclosure Placement

`read_files_with_line_numbers` belongs to the highest-priority public limit-disclosure family.

This endpoint must disclose stable caller-actionable limits before the caller hits them, but it must keep request-shape limits separate from operation-wide result limits.

### Parameter-description disclosure (required)

Stable request-field limits belong in the schema-owned parameter descriptions because callers need them while constructing the batch request.

For `read_files_with_line_numbers`, that includes:

- per-path length via `PATH_MAX_CHARS`
- batch path-count ceiling via `MAX_GENERIC_PATHS_PER_REQUEST`

The endpoint-local rule is therefore:

> Batch-shape request limits must be disclosed in [`schema.ts`](./schema.ts) through constant-backed parameter descriptions, not only in refusal text and not only in global architecture prose.

### Tool-description disclosure (required)

Stable operation-wide result limits belong in the runtime tool description because they govern the full returned batch surface rather than one field.

For `read_files_with_line_numbers`, that includes:

- the direct-read family response ceiling `READ_FILES_RESPONSE_CAP_CHARS`
- the rule that oversized multi-file batches must be reduced or split
- the rule that a large individual file may need to move to `read_file_content`

The endpoint-local rule is therefore:

> Operation-wide read-budget behavior must be disclosed in the runtime public tool description through constant-backed builders rather than endpoint-local hardcoded prose.

### Non-prioritized internal limits (required non-disclosure rationale)

This endpoint must not promote the following internal or broader server-owned limits into its routine public tool description as if they were the primary caller target:

- `GLOBAL_RESPONSE_HARD_CAP_CHARS`
- traversal admission or emergency runtime budgets
- sampling-window internals
- assertion-style refusal mechanics owned by the shared guardrail error contract

### Why this split is architecturally correct

The caller first decides whether the batch request itself is legal, then whether the whole batch remains a safe direct-read result surface.

The parameter description owns the first decision.
The tool description owns the second.

That split prevents hidden batch-shape limits on the request side and noisy internal-guardrail disclosure on the operation side.

---

## Batch Behavior

Multiple files may be included in a single request. Each file is processed in parallel. Results are joined with `\n---\n` separators. Each section begins with the file path on its own line, followed by the line-numbered content:

```
src/example/file-a.ts:
endsWithNewline: true
1: export const A = 1;

---
src/example/file-b.ts:
endsWithNewline: true
1: export const B = 2;
```

Per-file read failures are reported inline within the batch result as `path: Error - <message>` without aborting the entire batch. The response budget is validated both as a projected estimate before reads begin and as an actual measurement before the response is emitted.
