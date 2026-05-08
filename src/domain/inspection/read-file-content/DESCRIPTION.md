# DESCRIPTION — `read_file_content` Endpoint

## Purpose

`read_file_content` reads one text file through an explicitly selected read mode. It is designed for single-file content access where control over the read surface (full, bounded line range, bounded byte range, or cursor-based chunking) is required.

This endpoint complements `read_files_with_line_numbers`, which is optimized for batch full-file reads with guaranteed inline line-number annotation. Successful inline responses remain bounded by the shared direct-read family response ceiling, while mode-specific request windows are disclosed directly on the public parameter surface. Use `read_file_content` when:

- Reading a single large file that exceeds the direct-read family cap (via `line_range`, `byte_range`, or `chunk_cursor`)
- Targeting a specific line range within a file
- Iterating through a large file in sequential byte-bounded chunks

---

## Read Modes

### `full`

Reads the complete file content as decoded text through the shared inspection encoding. Limited to files within the inline full-read ceiling. Returns content with **inline one-based absolute line-number prefixes** on every line.

This mode is functionally equivalent to `read_files_with_line_numbers` for a single file and produces the same line-annotated output format. For batch reads, use `read_files_with_line_numbers` directly.

### `line_range`

Reads a bounded window of lines using a one-based start line and a maximum line count. Returns content with **inline one-based absolute line-number prefixes** using file-absolute positions (not window-relative offsets). Continuation is supported via `nextLine`.

### `byte_range`

Reads a bounded window of bytes using a zero-based start offset and a byte count. Content is returned as decoded text **without inline line-number prefixes** because byte ranges may begin or end mid-line. Continuation is supported via `nextByteOffset`.

### `chunk_cursor`

Reads sequential byte-bounded chunks using an opaque cursor string. Content is returned as decoded text **without inline line-number prefixes** because chunks are defined by byte boundaries, not line boundaries. Continuation is supported via `nextCursor`. Pass `null` as the cursor to begin from the first byte.

### Public bounded-read contract

The public request contract exposes stable mode-specific limits directly on the parameter surface:

- `line-range` defaults to 500 lines and is hard-capped at 2,000 lines
- `byte-range` and `chunk-cursor` default to 256 KiB and are hard-capped at 1 MiB per request window
- path and cursor surfaces stay bounded by the shared request-contract caps

The runtime tool description separately exposes the stable operation-wide read-family output ceiling and the retry implication that a legal request window can still decode into an oversized response.

---

## Public Limit Disclosure Model

For this endpoint, limit disclosure is intentionally split across two public surfaces.

### Parameter surface

Parameter descriptions carry the stable mode-specific request limits that callers need while constructing the request:

- default and hard-cap line counts for `line_range`
- default and hard-cap byte windows for `byte_range` and `chunk_cursor`
- path and cursor-shape boundaries where the public request contract exposes them

### Tool-description surface

The runtime tool description carries the stable operation-wide delivery rule:

- successful inline responses remain bounded by the direct-read family response cap
- a legal `byteCount` is not a guarantee that the decoded output will fit
- `chunk_cursor` is the designated fallback lane for oversized reads that cannot stay inside the direct-read family ceiling

### Intentional non-disclosure in routine tool text

The routine tool description does not prioritize:

- the exact global fuse as the primary planning number
- internal decoding or line-annotation implementation mechanics
- server-internal emergency/runtime guardrails beyond the caller-actionable read-family contract

Those surfaces remain owned by shared architecture conventions because they are server-internal protection mechanics rather than the primary caller-actionable contract.

---

## Content Fidelity Guarantee

The content field in all response modes reproduces the file content **100% verbatim and losslessly** after the shared inspection pipeline has resolved the supported text encoding. No transformation, trimming, whitespace normalization, or semantic rewriting is applied beyond that mandatory decoded-text projection.

Line-number prefixes (where applied) are purely additive — they prepend `N: ` to each line without modifying the line content itself. The original characters, including all leading whitespace, tabs, and indentation, are preserved exactly as stored in the file.

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

None of these visual effects alter the content that was transmitted to the agent. If the agent's downstream behavior (e.g., a patch operation) requires precise whitespace, the agent will operate on the correct content regardless of how the UI renders it.

**If you need to visually verify the exact transmitted content**, inspect the raw MCP protocol output (stdio) or enable debug logging in your MCP client, rather than relying on the rendered UI surface.

### The `full` mode returns an error about exceeding the inline full-read ceiling

The `full` mode is constrained to files within the shared inline full-read ceiling. Successful inline responses also remain within the shared direct-read family response ceiling of 450,000 characters. For files that exceed the inline full-read ceiling or whose decoded response would exceed the direct-read family ceiling, switch to `line_range` or `chunk_cursor` mode. The `chunk_cursor` mode is the designated fallback path for iterating through files larger than the direct-read cap.

### The `line_range` mode shows line numbers that do not match what I expected

Line numbers in `line_range` responses are **one-based absolute file positions**, not offsets relative to the requested window. The first line of the file is always line 1. The first line of a `line_range` response starting at line 200 is annotated as `200:`, not `1:`. This is intentional — absolute positions allow agents to reference lines directly without recalculating offsets.
