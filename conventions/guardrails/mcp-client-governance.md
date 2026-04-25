# MCP Client Governance — L1/L2 Defense-in-Depth, Limit Rationale, and Chunk-Read Policy

> **Context:** See [`CONVENTIONS.md`](../../CONVENTIONS.md) for the full conventions index and core invariants. See [`guardrails/overview.md`](./overview.md) for the execution-stack overview of all guardrail layers.

This document defines the two-layer governance model for MCP clients (LLM agents) interacting with this server, explains the calibration rationale for every response-family ceiling, and establishes the chunk-based reading pattern as the designated contract for oversized file access.

---

## 1. The Two-Layer Governance Model

This server operates inside an enterprise-grade agent environment where two independent governance layers protect context-window integrity. Neither layer replaces the other. Both must remain active.

### Layer 1 — Agent-Side Governance (System-Prompt Responsibility)

**Owner:** The orchestrating LLM agent via its active system prompt.

**Mechanism:** Before any tool call is issued, the agent's system prompt governance is responsible for:

- Acquiring file metadata (byte size) through a metadata-capable tool before any read-producing action.
- Computing a conservative estimated token load from the byte size using the shared `3 bytes/token` assumption.
- Evaluating a **risk-band classification** based on the remaining context window and the aggregate planned read load:
  - `green_band` — safe to proceed with a direct full read.
  - `yellow_silent_band` — elevated pressure; proceed with a silent warning.
  - `yellow_interactive_band` — high pressure; pause for explicit caller confirmation.
  - `red_override_required_band` — blocked by default; requires explicit override or narrower inspection.
  - `black_absolute_prohibition_band` — full read is forbidden regardless of user preference.
- Routing the request to `read_file_content` with `mode='chunk-cursor'` **before** a direct read attempt when the risk-band analysis indicates that a full direct read would consume an unsafe share of the remaining context window.

**Correct L1 flow for a large file:**

```
Agent → acquires metadata (byte size)
      → estimates token load
      → classifies risk-band = red or black
      → routes directly to read_file_content (mode='chunk-cursor')
      → reads file in sequential bounded chunks until EOF confirmed
```

This is the preferred path. When L1 governance is functioning correctly, the server's L2 hard cap for the direct-read family is never reached because the agent does not attempt a direct full read on a file that L1 analysis already flagged as too large.

### Layer 2 — Server-Side Governance (MCP Server Hard-Gap)

**Owner:** This MCP server via the endpoint-family guardrails in [`tool-guardrail-limits.ts`](../../src/domain/shared/guardrails/tool-guardrail-limits.ts).

**Mechanism:** A deterministic, context-agnostic hard ceiling applied before or after response serialization. The server cannot inspect the caller's live context occupancy. It enforces a calibrated static budget derived from the default model context window.

**Activation scenarios:**

| Scenario | L1 state | L2 outcome |
|---|---|---|
| L1 governance functioning correctly | Agent rerouted to chunk-read proactively | L2 never triggered — preferred path |
| L1 governance present but miscalibrated | Agent attempted direct read on large file | L2 blocks with `metadata_preflight_rejected` |
| L1 governance absent (no system-prompt guardrails) | Agent attempted direct read without metadata check | L2 blocks with `metadata_preflight_rejected` |
| Catastrophic L1 failure (read started, response too large) | Agent bypassed projected check | L2 blocks with `runtime_budget_exceeded` |

**L2 is a non-negotiable backstop.** It must remain active even when L1 governance is known to be present and functioning, because:

1. L1 governance quality varies by agent implementation and deployment configuration.
2. New agent integrations may not have L1 guardrails from day one.
3. L1 calibration errors (e.g. wrong bytes-per-token assumption, stale metadata) can cause incorrect green-band classifications.
4. The server has no runtime visibility into L1 state or context occupancy.

**L2 must never be weakened or removed on the assumption that L1 handles it.**

---

## 2. Response-Family Ceiling Rationale

All ceilings are calibrated against a default model context window of **1,000,000 tokens** using the shared **3 bytes/token** approximation, giving a reference envelope of **3,000,000 characters**.

### Context Budget Hierarchy

```
DEFAULT_MODEL_CONTEXT_WINDOW_APPROX_CHARS = 3,000,000   (100 % — reference envelope)
GLOBAL_RESPONSE_HARD_CAP_CHARS            =   600,000   ( 20 % — non-bypassable fuse)
READ_FILES_RESPONSE_CAP_CHARS             =   450,000   ( 15 % — direct-read family)
READ_FILE_CONTENT_RESPONSE_CAP_CHARS      =   450,000   ( 15 % — same family, alias)
FILE_DIFF_RESPONSE_CAP_CHARS              =   300,000   ( 10 % — file-backed diff)
CONTENT_MUTATION_TOTAL_INPUT_CHARS        =   400,000   ( 13 % — mutation input aggregate)
TEXT_DIFF_RESPONSE_CAP_CHARS              =   240,000   (  8 % — raw-text diff)
DISCOVERY_RESPONSE_CAP_CHARS             =   150,000   (  5 % — path discovery)
REGEX_SEARCH_RESPONSE_CAP_CHARS          =   120,000   (  4 % — regex/fixed-string search)
FIXED_STRING_SEARCH_RESPONSE_CAP_CHARS   =   120,000   (  4 % — same family, alias)
METADATA_RESPONSE_CAP_CHARS              =   100,000   (  3 % — metadata / checksums)
COUNT_LINES_RESPONSE_CAP_CHARS           =   100,000   (  3 % — count-lines, alias)
PATH_MUTATION_SUMMARY_CAP_CHARS          =    60,000   (  2 % — mutation summaries)
```

### Per-Family Rationale

| Constant | Value | Rationale |
|---|---|---|
| `GLOBAL_RESPONSE_HARD_CAP_CHARS` | 600,000 | Final non-bypassable fuse at 20% of the default context envelope. Broad enough for any legitimate large output while stopping pathological responses before the server shell returns them. |
| `READ_FILES_RESPONSE_CAP_CHARS` | 450,000 | Direct file reads deliver the highest reasoning value per character of all endpoint families. Forcing an agent to split a legitimate multi-file read into many sequential retries increases reasoning churn, repeated orchestration cost, and context-drift risk. The ceiling is therefore the largest of all family caps at 15%. Files that exceed this ceiling must use the `read_file_content` chunk-cursor path (see §3). |
| `READ_FILE_CONTENT_RESPONSE_CAP_CHARS` | 450,000 | Alias for `READ_FILES_RESPONSE_CAP_CHARS`. The `read_file_content` endpoint shares the direct-read response family for inline full, line-range, and byte-range content. Successful inline payloads are governed by the same caller-context envelope as the canonical direct-read family. |
| `FILE_DIFF_RESPONSE_CAP_CHARS` | 300,000 | File-backed diff inputs are bounded by the filesystem rather than by raw caller-controlled text, so diffs receive a higher cap than raw-text diffs. Still below the direct-read family because diffs are transformations of content, not the primary content itself. |
| `CONTENT_MUTATION_TOTAL_INPUT_CHARS` | 400,000 | Aggregate raw-content input for create/append workflows. Large enough for several substantial file-creation operations in a fresh environment while still preventing a single request from collapsing into an unbounded write surface. |
| `TEXT_DIFF_RESPONSE_CAP_CHARS` | 240,000 | Raw-text diff inputs are fully caller-controlled, making them a stronger amplification surface. Stricter than file-backed diffs to limit abuse potential while still supporting substantial in-memory artifact comparison. |
| `DISCOVERY_RESPONSE_CAP_CHARS` | 150,000 | Path-only output is cheaper per character than file content but can fan out across many entries. Bounded at 5% because path enumeration above this range creates orchestration noise instead of additional prompting value. |
| `REGEX_SEARCH_RESPONSE_CAP_CHARS` | 120,000 | Search snippets are semantically sparser than full reads. The lower ceiling encourages scope narrowing before the caller spends a large portion of context on repetitive match listings. |
| `FIXED_STRING_SEARCH_RESPONSE_CAP_CHARS` | 120,000 | Alias for `REGEX_SEARCH_RESPONSE_CAP_CHARS`. Same caller-facing search response budget regardless of backend scan mechanism. |
| `METADATA_RESPONSE_CAP_CHARS` | 100,000 | Metadata surfaces repeat similar keys and deliver less incremental reasoning value per character than direct content reads. Structured summaries remain compact. |
| `COUNT_LINES_RESPONSE_CAP_CHARS` | 100,000 | Alias for `METADATA_RESPONSE_CAP_CHARS`. Count results are compact structured summaries, not content reads. |
| `PATH_MUTATION_SUMMARY_CAP_CHARS` | 60,000 | Mutation acknowledgements should be concise. Echoing a large destructive batch back to the caller as a content payload would waste context on low-value confirmation text. |

### Request-Surface Schema Caps

The following schema-layer caps reject abusive request shapes before any handler execution begins. They are documented here for completeness alongside the response caps.

| Constant | Value | Applies to |
|---|---|---|
| `PATH_MAX_CHARS` | 4,096 | All path fields |
| `GLOB_PATTERN_MAX_CHARS` | 1,024 | All glob pattern fields |
| `REGEX_PATTERN_MAX_CHARS` | 2,048 | Regex pattern fields |
| `RAW_CONTENT_MAX_CHARS` | 150,000 | Single raw content field (create/append) |
| `REPLACEMENT_TEXT_MAX_CHARS` | 100,000 | Single line-range replacement payload |
| `MAX_CONTENT_FILES_PER_REQUEST` | 50 | Content-bearing file batches |
| `MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST` | 200 | Path mutation batches |
| `MAX_COMPARISON_PAIRS_PER_REQUEST` | 25 | File-backed diff pairs |
| `MAX_RAW_TEXT_DIFF_PAIRS_PER_REQUEST` | 10 | Raw-text diff pairs |
| `MAX_REPLACEMENTS_PER_FILE` | 25 | Line-range replacements per file |
| `MAX_INCLUDE_GLOBS_PER_REQUEST` | 32 | Positive glob filters |
| `MAX_EXCLUDE_GLOBS_PER_REQUEST` | 64 | Exclusion glob filters |
| `MAX_GENERIC_PATHS_PER_REQUEST` | 512 | Generic path batch fields |
| `MAX_DISCOVERY_ROOTS_PER_REQUEST` | 128 | Discovery root arrays |
| `MAX_REGEX_ROOTS_PER_REQUEST` | 64 | Regex/fixed-string search root arrays |
| `DISCOVERY_MAX_RESULTS_HARD_CAP` | 1,000 | Discovery result count fields |
| `MAX_TOTAL_RAW_TEXT_REQUEST_CHARS` | 400,000 | Aggregate raw content input |
| `LINE_REPLACEMENT_TOTAL_INPUT_CHARS` | 300,000 | Aggregate replacement text input |

---

## 3. Chunk-Based Reading — The Designated Contract for Oversized Files

When a file exceeds `READ_FILES_RESPONSE_CAP_CHARS` (450,000 characters projected), the agent **must not** treat this as an error requiring retry with the same tool. The designated path is `read_file_content` with `mode='chunk-cursor'`.

### Why chunk-based reading is architecturally correct

Multiple `read_file_content` calls with `mode='chunk-cursor'` do introduce reasoning overhead compared to a single direct full read. However, a file that exceeds the direct-read family cap would consume 15% or more of the default context window in a single call. In practice, for files measured above the cap (e.g. 721,274 characters as in the triggering example), a direct read would consume approximately **24%** of the default context envelope — an unsafe and potentially session-degrading allocation for a single file.

The trade-off is explicit and intentional:

| Option | Context cost | Reasoning risk |
|---|---|---|
| Direct read of a 720K-char file | ~24% of context window consumed in one call | Context flooding degrades remaining session quality |
| Chunk-read via `read_file_content` + `chunk_cursor` | ~15% per chunk, multiple calls | Slight reasoning-drift risk between chunks, bounded and manageable |
| Proactive L1 routing before any tool call | Metadata call only | No context flooding, no chunk overhead — optimal |

### Governance rule

The following is the binding governance decision for all MCP clients using this server:

> **When `read_files_with_line_numbers` returns a `metadata_preflight_rejected` error with `failure_code: metadata_preflight_rejected` indicating that the projected output exceeds `READ_FILES_RESPONSE_CAP_CHARS`, the agent MUST switch to `read_file_content` with `mode='chunk-cursor'` and read the file in sequential bounded chunks until EOF is confirmed. This is not a workaround — it is the designated contractual fallback path for files that exceed the direct-read family ceiling.**

### Chunk-read protocol (agent obligation)

1. Call `read_file_content` with `mode='chunk-cursor'` and no initial `cursor` (starts from beginning).
2. Process the returned chunk content.
3. If the response includes a continuation `cursor`, call again with that `cursor`.
4. Repeat until the response confirms EOF (no continuation cursor returned).
5. After all chunks are collected, verify that the ordered chunk set covers the file from the first line through the final EOF-confirmed chunk with no gaps.

### Important limit for `read_file_content` chunk-cursor mode

The `read_file_content` endpoint shares the same response family ceiling (`READ_FILE_CONTENT_RESPONSE_CAP_CHARS = 450,000`). Individual chunks are bounded internally by the mode-specific `byteCount` parameter (default 256 KiB, hard cap 1 MiB). This means each chunk call will comfortably fit within the family ceiling — chunk responses are bounded by design.

---

## 4. Key Design Decisions Summary

| Decision | Rationale |
|---|---|
| L2 hard gaps remain active even when L1 governance is present | L1 quality is deployment-dependent; the server cannot observe L1 state or context occupancy |
| `READ_FILES_RESPONSE_CAP_CHARS` is set to 450,000, not higher | 15% of the context envelope is the largest responsible single-call allocation for direct file content; the global fuse (600,000) is the only ceiling above this |
| `READ_FILE_CONTENT_RESPONSE_CAP_CHARS` aliases `READ_FILES_RESPONSE_CAP_CHARS` | Both endpoints serve the same direct-read family and must present a consistent caller-context envelope |
| The `PROJECTED_READ_RECOMMENDED_ACTION` error message explicitly names `read_file_content` + `chunk-cursor` | Agents must receive an unambiguous contract directive, not a generic scope-reduction suggestion, so they can route correctly without reasoning overhead |
| Chunk-based reading is the designated contract, not a workaround | The server architecture explicitly reserves `read_file_content` + `chunk_cursor` as the official path for files above the direct-read ceiling |
