# Search Platform Overview

> **Context:** See [`CONVENTIONS.md`](../../CONVENTIONS.md) for the root conventions index.  
> **Related guardrails:** See [`conventions/guardrails/overview.md`](../guardrails/overview.md) for the full guardrail stack.  
> **Related resume model:** See [`conventions/resume-architecture/overview.md`](../resume-architecture/overview.md) for the shared resume-session architecture.
> **Structured response authority:** See [`conventions/mcp-response-contract/structured-content-contract.md`](../mcp-response-contract/structured-content-contract.md) for the primary-result versus envelope contract.

---

## Purpose

This document defines the target-state search-platform architecture for the MCP Filesystem Extended server.

It is authoritative for:

- the role of `ugrep` in the inspection platform,
- the split between search, read, and count concerns,
- the distinction between explicit-file search and recursive traversal search,
- the lane model used by preview-capable search families,
- and the non-negotiable future-state architecture for large text-compatible file search.

---

## Core Architecture Statement

The search platform has three distinct concerns:

| Concern | Primary backend | Primary contract |
|---|---|---|
| Search | `ugrep` | bounded search result surface plus lane-specific resume behavior |
| Read | shared text-read core and streaming readers | bounded content-access surface |
| Count | streaming line counter for total-only, shared native-search lane for pattern-aware | bounded counting surface |

These concerns must not be collapsed into one generic large-file engine.

---

## Primary Search Backend Rule

`ugrep` is the primary search backend for preview-capable search families.

This means:

- literal search uses the shared fixed-string lane,
- regex search uses the shared regex lane,
- pattern-aware count behavior may reuse the shared native-search lane where explicitly modeled,
- and large text-search workloads must not fall back to whole-file in-process JavaScript search merely because the file is large.

---

## Explicit-File Search Versus Recursive Search

The architecture distinguishes two very different search surfaces.

### 1. Explicit-file search

An explicit-file search request names one file directly.

For this surface:

- the file is validated,
- the content state is classified,
- supported text-compatible states may proceed to the shared search backend,
- result size remains bounded by `maxResults`, family response caps, resume-mode behavior, and the global fuse,
- and large file byte size alone is not a sufficient reason to reject the search before the backend is allowed to execute.

### 2. Recursive traversal search

A recursive traversal search request names one or more directories and lets the server discover candidate files beneath them.

For this surface:

- the shared traversal admission planner decides whether the workload is `inline`, `preview-first`, `completion-backed-required`, or `narrowing-required`,
- candidate aggregate evidence, traversal breadth, and projected output surface all participate,
- preview-family resume modes are available where the family supports them,
- and the deeper traversal runtime fuse remains a final emergency safeguard.

These surfaces must not be treated as the same hardgap boundary.

---

## Preview-Capable Search Families

The preview-capable search families are:

| Endpoint | Role |
|---|---|
| `search_file_contents_by_regex` | regex content search |
| `search_file_contents_by_fixed_string` | literal content search |

These families support:

- `resumeMode = 'next-chunk'`
- `resumeMode = 'complete-result'`

Both remain same-endpoint and token-only resume surfaces.

---

## Large-File Rule

The target-state architecture explicitly allows large text-compatible file search when:

- the file content state is eligible for the requested search operation,
- the pattern/literal is valid for runtime execution,
- the response surface remains bounded,
- and the server-owned guardrails are not crossed.

The architecture does **not** say:

> "Large file size alone means the search endpoint must refuse before the search backend runs."

That behavior is invalid for explicit-file search on supported text-compatible surfaces.

---

## Relationship to Resume and Structured Response Authority

When a preview-capable search family returns a resumable response:

- `structuredContent.admission` and `structuredContent.resume` remain the authoritative machine-readable envelope metadata,
- primary result data remains complete in `content.text`,
- any structured primary-result payload mirrors the same underlying result objects instead of replacing `content.text`,
- and continuation guidance may be appended in `content.text` after the primary data when the response is actually resumable and carries a non-null token.

This authority split is owned centrally by [`structured-content-contract.md`](../mcp-response-contract/structured-content-contract.md) and must not be weakened locally into "compact guidance only" text surfaces.

---

## Non-Negotiable Invariants

1. Search remains distinct from read.
2. Search remains distinct from total-only counting.
3. `ugrep` remains the primary search backend.
4. Explicit-file search and recursive traversal search do not share the same hardgap semantics.
5. Family response caps and the global fuse remain authoritative.
6. Read families do not inherit search-family pre-scan hardgap semantics.
