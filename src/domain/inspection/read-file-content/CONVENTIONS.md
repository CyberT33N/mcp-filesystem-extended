# CONVENTIONS — `read_file_content` Endpoint

## Endpoint-Local SSOT Role

This file is the endpoint-local single source of truth for the non-obvious conventions, guardrails, and architectural boundaries of `read_file_content`.

Shared cross-family rules remain owned by the workspace-level conventions index and the shared guardrail slices, especially [`public-limit-disclosure-governance.md`](../../../../conventions/guardrails/public-limit-disclosure-governance.md). This file does not duplicate the global policy tree. It explains how that disclosure policy applies specifically to the single-file bounded-read surface.

---

## Architectural Principle: Content Fidelity (1:1 Guarantee)

The `read_file_content` endpoint guarantees **100% verbatim, lossless content reproduction** for all read modes. No transformation, normalization, trimming, or whitespace modification is applied to the decoded file content at any point in the pipeline.

This guarantee is enforced at the infrastructure level:

- `readFile()` reads raw bytes from the filesystem without any modification.
- The shared inspection pipeline resolves one supported text encoding before decoded text is emitted to the caller-facing surface.
- The response formatter concatenates header metadata and content using `"\n"` as a separator only — no content transformation occurs.

The visual appearance of indentation or whitespace in MCP client UIs is a rendering concern, not a transport concern. See `DESCRIPTION.md` for the troubleshooting section on MCP client rendering artifacts.

The endpoint also separates **addressable lines** from the file's EOF newline terminator:

- a trailing newline does **not** create an extra numbered phantom line,
- the file-level EOF newline state is surfaced separately through `endsWithNewline`,
- this keeps line coordinates stable for patching while still preserving terminal-newline truth for agents.

---

## Architectural Principle: Line-Number Annotation by Mode

Line-number annotation policy is **mode-dependent** and architecturally justified per mode. The rationale is grounded in **LLM Agent Anti-Hallucination Architecture** and **Context Engineering** principles.

LLM agents operate in an iterative context accumulation process. The context window persists across many turns within a session. When an agent reads file content in Turn N and subsequently attempts a patch operation or a targeted search in Turn N+X, it must resolve precise line numbers. Without inline line-number context, the agent is forced to recount or estimate, which introduces hallucination risk at exactly the most critical workflow stage: source-modifying operations.

The mode-specific decisions below reflect this architecture. Inline line-number annotation is applied where it is semantically correct and architecturally required. It is deliberately withheld where it would be semantically misleading.

---

### `full` Mode — Inline Line Numbers: APPLIED

**Decision:** Inline `N: ` prefix on every line. One-based. Absolute relative to the full file.

**Rationale:** When reading a complete file, the agent receives the entire file content. Any subsequent patch, search, or modification operation requires precise line-number targeting. Inline line-number prefixes (e.g., `1: import fs from "fs/promises";`) allow the agent to reference lines directly from its context window without recomputation or re-reading.

The infrastructure function `formatLineNumberedTextContent` from `@infrastructure/filesystem/text-read-core` is applied to the content string before the response is emitted. The annotation is purely additive — the original line content is not modified.

If the file ends with a newline terminator, that EOF fact is reported via `endsWithNewline` rather than as an extra numbered empty line. EOF is a file-boundary property, not a separate addressable source line.

---

### `line_range` Mode — Inline Line Numbers: APPLIED (Absolute)

**Decision:** Inline `N: ` prefix on every returned line. One-based. Absolute file positions — not relative to the returned window.

**Rationale:** When reading a bounded line range (e.g., lines 200–400), the response includes inline line numbers using absolute file positions. This is architecturally critical for long-context iterative workflows.

If an agent reads lines 200–400 in Turn 3 and references a specific function in Turn 9, it needs to know that `export function processData` is at absolute line 215 — not at relative offset 15 within the returned window. Relative offsets require arithmetic reconstruction from `startLine + offset`, which is a hallucination risk. Absolute inline numbers eliminate this failure mode entirely.

**Dual navigation model:** The metadata fields `startLine`, `endLine`, and `returnedLineCount` serve a macro-navigation role (locating the window within the file). Inline line numbers serve the micro-navigation role (addressing individual lines within the window). Both roles are architecturally distinct and must coexist.

If the requested window reaches the physical last line of a newline-terminated file, the terminal newline is still represented through `endsWithNewline` instead of an extra numbered empty line.

Format example for a `line_range` read starting at line 200:
```
200: export const SOME_CONSTANT = 42;
201:
202: export function processData(input: string): string {
203:   return input.trim();
204: }
```

---

### `byte_range` Mode — Inline Line Numbers: NOT APPLIED

**Decision:** No inline line-number prefix. Raw content only.

**Rationale:** Byte ranges are orthogonal to line structure. A byte range may begin or end at any byte offset, including mid-line. Applying a line-number prefix to partial line content would be semantically incorrect and actively misleading to the consuming agent:

- `"312: [partial line content]"` falsely suggests that the full line 312 was returned.
- In reality, only bytes from a given offset within line 312 may have been returned, with the preceding bytes of that line absent.

Inline line-number prefixes are therefore architecturally forbidden for `byte_range` responses. The metadata fields `startByte`, `endByteExclusive`, `totalFileBytes`, `hasMore`, and `nextByteOffset` provide the necessary navigation context for the byte domain.

---

### `chunk_cursor` Mode — Inline Line Numbers: NOT APPLIED

**Decision:** No inline line-number prefix. Raw content only.

**Rationale:** Cursor-based chunk reads share the same byte-domain semantics as `byte_range`. Chunks are defined by byte boundaries, not line boundaries. The cursor encodes a byte offset, and any given chunk may begin mid-line if the previous chunk ended mid-line.

Inline line-number prefixes are therefore architecturally forbidden for `chunk_cursor` responses. The metadata fields `cursor`, `nextCursor`, `startByte`, `endByteExclusive`, `totalFileBytes`, and `hasMore` provide the necessary navigation context for sequential cursor-driven iteration.

---

## Architectural Principle: Public Limit Disclosure Placement

`read_file_content` belongs to the highest-priority public limit-disclosure family.

This endpoint must disclose stable caller-actionable limits before the caller hits them, but it must do so on the correct public surface.

### Parameter-description disclosure (required)

Stable request-field limits belong in the schema-owned parameter descriptions because callers need them while constructing the request.

For `read_file_content`, that includes:

- `path` length via `PATH_MAX_CHARS`
- `line_range` window defaults and hard ceiling via `READ_FILE_CONTENT_LINE_RANGE_DEFAULT_LINES` and `READ_FILE_CONTENT_LINE_RANGE_MAX_LINES`
- `byte_range` / `chunk_cursor` byte-window defaults and hard ceiling via `READ_FILE_CONTENT_BYTE_RANGE_DEFAULT_BYTES` and `READ_FILE_CONTENT_BYTE_RANGE_MAX_BYTES`
- cursor-string length via `READ_FILE_CONTENT_CURSOR_MAX_CHARS`

The endpoint-local rule is therefore:

> Field-local bounded-read limits must be disclosed in [`schema.ts`](./schema.ts) through constant-backed parameter descriptions, not only in refusal messages and not only in global architecture prose.

### Tool-description disclosure (required)

Stable operation-wide result limits belong in the runtime tool description because they shape retry planning for the whole operation rather than one input field.

For `read_file_content`, that includes:

- the direct-read family response ceiling `READ_FILE_CONTENT_RESPONSE_CAP_CHARS`
- the rule that `full` mode remains a smaller-file inline surface
- the rule that a legal `byteCount` still does not guarantee that the decoded response fits inside the direct-read family output budget
- the designated fallback relationship between direct inline reads and bounded `line-range` / `chunk-cursor` continuation

The endpoint-local rule is therefore:

> Operation-wide read-budget behavior must be disclosed in the runtime public tool description through constant-backed builders rather than as endpoint-local hardcoded prose.

### Non-prioritized internal limits (required non-disclosure rationale)

This endpoint must not promote the following internal or broader server-owned limits into its routine public tool description as if they were the primary caller target:

- `GLOBAL_RESPONSE_HARD_CAP_CHARS`
- traversal admission or emergency runtime budgets
- sampling-window internals
- assertion-style refusal mechanics owned by the shared guardrail error contract

### Why this split is architecturally correct

The caller makes two different decisions:

1. which mode and window shape to request,
2. whether the whole operation is still safe as one direct-read response.

The parameter description owns the first decision.
The tool description owns the second.

That split prevents two failure modes at once:

- hidden request-field limits that only become visible after a refusal,
- and noisy internal guardrail disclosure that gives the caller the wrong optimization target.

---

## Summary Table

| Mode | Inline Line Numbers | Line Basis | Rationale Summary |
|------|--------------------|-----------|--------------------|
| `full` | ✅ Applied | One-based, absolute | Full file read; agent needs absolute line anchors for all subsequent operations |
| `line_range` | ✅ Applied | One-based, absolute | Bounded line window; absolute anchors prevent offset arithmetic errors and hallucination |
| `byte_range` | ❌ Not applied | — | Byte domain; chunk may begin/end mid-line; inline numbers would be semantically incorrect |
| `chunk_cursor` | ❌ Not applied | — | Byte domain; same rationale as `byte_range` |
