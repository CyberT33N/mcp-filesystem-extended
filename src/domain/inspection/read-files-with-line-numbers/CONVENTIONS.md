# CONVENTIONS — `read_files_with_line_numbers` Endpoint

## Architectural Principle: Content Fidelity (1:1 Guarantee)

The `read_files_with_line_numbers` endpoint guarantees **100% verbatim, lossless content reproduction** for all files in every batch request. No transformation, normalization, trimming, or whitespace modification is applied to the raw file content at any point in the pipeline.

This guarantee is enforced at the infrastructure level:

- `readFile()` reads raw bytes from the filesystem without any modification.
- `.toString("utf8")` converts bytes to a UTF-8 string without stripping or altering any characters.
- `formatLineNumberedTextContent` applies only additive prefix annotation (`N: `) per line — the original line content is never modified.

The visual appearance of indentation or whitespace in MCP client UIs is a rendering concern, not a transport concern. See `DESCRIPTION.md` for the troubleshooting section on MCP client rendering artifacts.

---

## Architectural Principle: Mandatory Inline Line-Number Annotation

All content returned by this endpoint is annotated with **inline one-based absolute line-number prefixes** on every line. This is not configurable and is applied unconditionally to every file in every batch request.

### Rationale: LLM Agent Anti-Hallucination Architecture

LLM agents operate in an iterative context accumulation process. The context window persists across many turns within a session. When an agent reads file content in Turn N and subsequently attempts a patch operation, a targeted search, or any reference to a specific location in Turn N+X, it must resolve precise line numbers.

Without inline line-number context, the agent is forced to recount from the top of the file or estimate an offset — operations that introduce hallucination risk at exactly the most critical workflow stage: source-modifying operations such as `apply_patch`, `replace_file_line_ranges`, or targeted `search_file_contents_by_regex`.

Inline line numbers eliminate this failure mode by making every line self-describing within the agent's context window.

### Format

Every line is prefixed with its one-based absolute file position followed by `: ` and then the original line content:

```
1: import fs from "fs/promises";
2: import path from "path";
3:
4: export function example(): void {
5:   console.log("hello");
6: }
```

The prefix is purely additive. The original line content — including all leading whitespace, tabs, and indentation — is reproduced exactly after the `N: ` prefix.

### Relationship to `read_file_content`

This endpoint does not use a different infrastructure path than `read_file_content`. Both endpoints call the same underlying `readValidatedFullTextFile` function from `@infrastructure/filesystem/text-read-core`. The `formatLineNumberedTextContent` function is also defined in that same infrastructure module and is shared between the two endpoints.

The distinction is that `read_files_with_line_numbers` always applies `formatLineNumberedTextContent`, while `read_file_content` applies it only in the `full` and `line_range` modes where it is semantically correct. See the `CONVENTIONS.md` file in the `read-file-content` endpoint directory for the full mode-by-mode rationale.

### Why This Cannot Be Made Optional

Making line-number annotation opt-in would undermine its purpose. An LLM agent that does not request line numbers but then attempts a patch operation is in a worse position than one that always receives line numbers — because the omission is invisible in the context window. Mandatory annotation ensures that every agent context that includes this endpoint's output is structurally equipped for precise line-level targeting without requiring the orchestrating prompt to explicitly request it.

---

## Batch Behavior

Multiple files may be included in a single request. Each file is processed in parallel. Results are joined with `\n---\n` separators. Each section begins with the file path on its own line, followed by the line-numbered content:

```
src/example/file-a.ts:
1: export const A = 1;
2:

---
src/example/file-b.ts:
1: export const B = 2;
2:
```

Per-file read failures are reported inline within the batch result as `path: Error - <message>` without aborting the entire batch. The response budget is validated both as a projected estimate before reads begin and as an actual measurement before the response is emitted.
