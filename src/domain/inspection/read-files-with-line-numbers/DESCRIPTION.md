# DESCRIPTION — `read_files_with_line_numbers` Endpoint

## Purpose

`read_files_with_line_numbers` reads one or more text files and returns their full content with **inline one-based absolute line-number prefixes** on every line. It is the primary full-file read surface for LLM agent workflows that require precise line-level targeting in subsequent operations.

This endpoint is optimized for batch parallel reads where all files can be read in a single call. Use this endpoint when:

- Reading one or more files in full before analysis, refactoring, or editing
- Establishing a full-file anchor before a source-modifying operation
- Batch-reading multiple files that must all be available before a workflow step can proceed

For single-file reads with bounded access (line range, byte range, or cursor-based chunking), use `read_file_content` instead.

---

## Output Format

Each file section begins with the file path on its own line, followed by the full line-numbered content, and ends with a newline:

```
src/example/file.ts:
1: import fs from "fs/promises";
2:
3: export function example(): void {
4:   console.log("hello");
5: }

```

When multiple files are included, sections are separated by `\n---\n`:

```
src/example/file-a.ts:
1: export const A = 1;

---
src/example/file-b.ts:
1: export const B = 2;

```

---

## Content Fidelity Guarantee

The content field for every file reproduces the file content **100% verbatim and losslessly**. No transformation, trimming, whitespace normalization, or encoding conversion is applied beyond the mandatory UTF-8 decoding of the raw byte stream.

Line-number prefixes are purely additive — they prepend `N: ` to each line without modifying the line content itself. The original characters, including all leading whitespace, tabs, and indentation, are preserved exactly as stored in the file.

---

## Batch Behavior

- All files in the request are read in parallel.
- The response budget is validated as a projected estimate before reads begin, and again as an actual measurement before the response is emitted. Oversized batch requests are rejected early.
- Per-file read failures are reported inline as `path: Error - <message>` without aborting the remaining files in the batch.

---

## Troubleshooting

### Indentation and whitespace appear collapsed or missing in the MCP client UI

**This is a rendering artifact of the MCP client surface — not a defect in this endpoint.**

The response payload from this endpoint is transmitted as a plain-text string over the MCP transport layer (stdio JSON). All whitespace characters — spaces, tabs, newlines, carriage returns, and any other Unicode whitespace — are serialized correctly and transmitted without modification.

The LLM agent that consumes the response receives the full content string with all whitespace intact. This is the only consumer that matters for correctness, and correctness is guaranteed at this level.

What some MCP client UIs display to the human operator is a rendered interpretation of the response text. Depending on the client:

- Markdown rendering may collapse leading spaces in non-code-fenced blocks.
- Monospace rendering may differ between clients.
- The visual appearance of indentation may vary based on font, zoom level, and renderer settings.

None of these visual effects alter the content that was transmitted to the agent. If the agent's downstream behavior (e.g., a patch operation or a search) requires precise whitespace, the agent will operate on the correct content regardless of how the UI renders it.

**If you need to visually verify the exact transmitted content**, inspect the raw MCP protocol output (stdio) or enable debug logging in your MCP client, rather than relying on the rendered UI surface.

### The projected response budget check fails before reading begins

The projected budget check estimates the total response size from the file sizes before any reads occur. If the projection exceeds the direct-read family cap, the entire batch is rejected early with a recommendation to reduce the file set or switch to `read_file_content` with `chunk_cursor` mode for large individual files.

To resolve: reduce the number of files per request, or split large files using `read_file_content` with `line_range` or `chunk_cursor` mode.

### One file in the batch fails but others succeed

Per-file failures are isolated. The error for the failing file is reported inline in the batch response as `path: Error - <message>`. All other files in the batch that were read successfully are included in the response normally. No re-request is needed for the files that succeeded.
