# CONVENTIONS — `search_file_contents_by_regex` Endpoint

## Purpose of This Document

This document is the endpoint-local single source of truth for the non-obvious conventions, guardrails, and architectural boundaries of `search_file_contents_by_regex`.

Shared cross-family rules remain owned by the workspace-level conventions index and the shared guardrail, content-classification, search-platform, and resume-architecture slices. This file does not duplicate those broader rules. It explains how they apply specifically to the regex content-search surface.

---

## What This Endpoint Is

`search_file_contents_by_regex` is the preview-capable content-search surface for regex-driven matching across explicit file scopes or guarded directory-root traversal scopes.

Its contract is:

> Validate the requested scopes, determine whether candidate file surfaces are text-compatible enough for regex search, execute regex matching through the shared runtime lane, preserve root-local failures, and surface bounded match payloads together with same-endpoint resume metadata when the workload leaves the inline lane.

This endpoint is intentionally distinct from adjacent inspection surfaces:

- It does **not** read file bodies as the primary business result.
- It does **not** enumerate directory entries as its primary business result.
- It does **not** perform fixed-string-only search semantics.
- It does **not** count lines as its primary business question.

Instead, it answers one question only:

> Where do the requested regex matches occur across the requested file or directory scopes, and how does the bounded search session continue if the result is too broad for one inline response?

---

## Request-Surface Conventions

### Base requests

- Base requests must provide at least one value in `roots`.
- Base requests must provide `regex`.
- `includeGlobs`, `excludeGlobs`, and `includeExcludedGlobs` remain optional narrowing controls.
- `respectGitIgnore` remains an additive opt-in, not the primary traversal policy.
- `maxResults` defaults to `100`.
- `caseSensitive` defaults to `false`.

### Resume requests

- Resume requests are same-endpoint and token-only.
- A resume request may provide only `resumeToken` and `resumeMode`.
- `resumeMode` is limited to `next-chunk` or `complete-result`.
- The endpoint-local docs must not imply that callers should resend the original query-defining fields on resume-only requests.

### Explicit-file versus directory-root semantics

- Explicit file scopes are searched directly after path validation, content-state eligibility, and runtime regex safety succeed.
- Directory-root scopes enter the shared traversal admission planner before broad traversal begins.
- Recursive aggregate governance must not be described as a blanket hard refusal for explicit large text-compatible files.

---

## Content-State and Eligibility Conventions

### Shared content-state authority

Regex search consumes the shared content-classification and capability model rather than a local boolean text check.

The endpoint-local implications are:

- `TEXT_CONFIDENT` is search-eligible.
- `HYBRID_TEXT_DOMINANT` is search-eligible.
- `HYBRID_BINARY_DOMINANT`, `BINARY_CONFIDENT`, and `UNKNOWN_LARGE_SURFACE` are not search-eligible.

### Text-first regex rule

- Regex remains a text-oriented lane.
- The richer shared taxonomy does **not** make regex a universally hybrid-capable lane.
- The endpoint must not imply unrestricted hybrid-search support.

### Encoding-aware rule

- Raw NUL-byte presence alone is not sufficient to classify a candidate as binary.
- Supported text-compatible encodings remain eligible when the shared classifier resolves them as text-dominant.
- When the shared capability layer requires decoded-text fallback for a supported text encoding, the endpoint may use decoded text for match collection rather than rejecting the file.

---

## Runtime Lane Conventions

### Primary backend rule

`ugrep` is the primary regex-search backend for supported text-compatible execution.

That means:

- the endpoint-local runtime path should be described as the shared regex lane,
- endpoint-local docs must not present legacy in-process JavaScript full-file search as the authoritative search model,
- and the historical backup plan remains lineage only, never the current authority.

### Lane-aware request-validation rule

- Regex validity is request-wide and lane-aware.
- A caller pattern must be accepted by both the local JavaScript regex guardrail compiler and the selected native `ugrep` lane.
- Backend-lane feature requirements such as lookahead or lookbehind must be classified before root execution begins.
- If the pattern cannot be routed to a supported lane, the endpoint must return a request-wide guardrail failure instead of degrading the issue into a root-local runtime error.

### Preview-capable delivery rule

This endpoint is a preview-capable search family.

Supported resume modes are:

- `next-chunk`
- `complete-result`

The endpoint-local docs must describe both as same-endpoint resume intents and must not imply a second public continuation endpoint.

### Admission outcomes

Broad directory-root workloads are governed by the shared traversal admission planner.

The caller-visible architectural outcomes are:

- `inline`
- `preview-first`
- `completion-backed-required`
- `narrowing-required`

The regex endpoint-local docs must explain that broad valid workloads may degrade into preview-first or server-owned completion behavior, while structurally unsafe regex, unsupported content states, invalid scopes, or over-hard-gap workloads still refuse.

---

## Structured Result Conventions

### Per-root result model

The structured result is intentionally rooted in `roots[]`.

Each root result owns:

- `root`
- `matches`
- `filesSearched`
- `totalMatches`
- `truncated`
- `error`

This split is required because multi-root regex search supports root-local failure capture without collapsing the full request into one undifferentiated error.

### Aggregate result model

The batch surface additionally owns:

- `totalLocations`
- `totalMatches`
- `truncated`
- `admission`
- `resume`

`totalLocations` is not the same thing as `totalMatches`. A single location may carry one emitted excerpt while `totalMatches` reflects how many matches were encountered before truncation completed.

### Root-local error rule

- `error` is root-local.
- Multi-root requests may therefore contain successful roots and failed roots in the same structured response.
- The endpoint-local docs must not imply that one root failure invalidates sibling roots automatically.
- Request-wide regex contract failures are not root-local and must fail the whole request before sibling-root execution continues.

---

## Text-Surface Conventions

### Primary data rule

`content.text` remains the primary information carrier.

That means:

- full caller-visible match data appears in `content.text`
- continuation guidance is appended after the data when the response is resumable
- `structuredContent` mirrors the primary result and owns the machine-readable `admission` / `resume` envelope

### Continuation-aware formatting rule

When the response is resumable:

- the full match payload still appears in `content.text`
- a continuation block is appended afterward
- the continuation block must not replace the primary result data with compact summary text only

### Response-cap rule

- family-level response caps remain authoritative for inline and `next-chunk`
- `complete-result` uses the global fuse as the effective final cap instead of the regex-family cap
- endpoint-local docs must not describe `complete-result` as a cap bypass

---

## Relationship to Sibling Endpoints

### Compared with `search_file_contents_by_fixed_string`

`search_file_contents_by_fixed_string` is the literal-search sibling.

`search_file_contents_by_regex` owns pattern-based matching where structural regex validation, regex runtime safety, and regex-specific lane behavior matter.

### Compared with `count_lines`

`count_lines` is the bounded counting surface.

`search_file_contents_by_regex` localizes matches and supports preview-style partial delivery. `count_lines` does not expose preview-style partial totals.

### Selection rule

Use `search_file_contents_by_regex` when the caller needs:

- pattern-based content matching
- match locations with excerpts
- preview-first or completion-result continuation behavior for broad valid workloads

Do not use it as a substitute for literal-only matching, total-only counting, metadata lookup, or file-content reading workflows.

---

## Local Documentation Ownership Split

The endpoint-local documentation triplet is intentionally split by role:

- `CONVENTIONS.md` owns endpoint-local conventions, guardrails, and policy boundaries
- `DESCRIPTION.md` owns the detailed endpoint architecture for LLM-agent use
- `README.md` owns the concise developer-facing summary

Root-level documentation is expected to re-reference this endpoint-local triplet later. This file must therefore stay endpoint-local and must not drift into root-level TOC ownership.
