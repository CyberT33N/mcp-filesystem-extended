# CONVENTIONS — `read_file_content` Endpoint

## Architectural Principle: Content Fidelity (1:1 Guarantee)

The `read_file_content` endpoint guarantees **100% verbatim, lossless content reproduction** for all read modes. No transformation, normalization, trimming, or whitespace modification is applied to the raw file content at any point in the pipeline.

This guarantee is enforced at the infrastructure level:

- `readFile()` reads raw bytes from the filesystem without any modification.
- `.toString("utf8")` converts bytes to a UTF-8 string without stripping or altering any characters.
- The response formatter concatenates header metadata and content using `"\n"` as a separator only — no content transformation occurs.

The visual appearance of indentation or whitespace in MCP client UIs is a rendering concern, not a transport concern. See `DESCRIPTION.md` for the troubleshooting section on MCP client rendering artifacts.

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

---

### `line_range` Mode — Inline Line Numbers: APPLIED (Absolute)

**Decision:** Inline `N: ` prefix on every returned line. One-based. Absolute file positions — not relative to the returned window.

**Rationale:** When reading a bounded line range (e.g., lines 200–400), the response includes inline line numbers using absolute file positions. This is architecturally critical for long-context iterative workflows.

If an agent reads lines 200–400 in Turn 3 and references a specific function in Turn 9, it needs to know that `export function processData` is at absolute line 215 — not at relative offset 15 within the returned window. Relative offsets require arithmetic reconstruction from `startLine + offset`, which is a hallucination risk. Absolute inline numbers eliminate this failure mode entirely.

**Dual navigation model:** The metadata fields `startLine`, `endLine`, and `returnedLineCount` serve a macro-navigation role (locating the window within the file). Inline line numbers serve the micro-navigation role (addressing individual lines within the window). Both roles are architecturally distinct and must coexist.

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

## Summary Table

| Mode | Inline Line Numbers | Line Basis | Rationale Summary |
|------|--------------------|-----------|--------------------|
| `full` | ✅ Applied | One-based, absolute | Full file read; agent needs absolute line anchors for all subsequent operations |
| `line_range` | ✅ Applied | One-based, absolute | Bounded line window; absolute anchors prevent offset arithmetic errors and hallucination |
| `byte_range` | ❌ Not applied | — | Byte domain; chunk may begin/end mid-line; inline numbers would be semantically incorrect |
| `chunk_cursor` | ❌ Not applied | — | Byte domain; same rationale as `byte_range` |
