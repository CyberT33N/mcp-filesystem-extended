# DESCRIPTION — `count_lines` Endpoint

## Purpose

`count_lines` is the counting endpoint for file paths and traversed directory scopes.

It answers a bounded aggregation question rather than a localization or read question:

- how many lines exist in the requested scope,
- and, when a regex is supplied, how many of those lines match.

Use this endpoint when the caller needs totals, not match locations or file-body output.

---

## Request Model

### Base request surface

The base request is rooted in these fields:

- `paths`
- `recursive`
- `regex`
- `includeGlobs`
- `excludeGlobs`
- `respectGitIgnore`
- `includeExcludedGlobs`
- `ignoreEmptyLines`

The important endpoint-local rules are:

- base requests must provide at least one path,
- `regex` remains optional,
- recursive traversal is opt-in,
- file-filter and exclusion controls narrow recursive breadth before counting proceeds.

### Resume request surface

`count_lines` is completion-backed only once a broad workload leaves the inline lane.

That means:

- resume requests are same-endpoint and token-only,
- the only supported resume mode is `complete-result`,
- `next-chunk` is intentionally unsupported for this family.

This endpoint therefore does not expose preview-style partial totals.

---

## Counting-Lane Architecture

`count_lines` has one public endpoint contract but two internal counting lanes.

### 1. Total-only counting

When no regex is supplied, the endpoint uses a large-file-safe streaming line counter.

This lane exists to keep total line counting bounded and stable even for larger text-compatible files.

### 2. Pattern-aware counting

When a regex is supplied, the endpoint counts matching lines rather than localizing matches.

The runtime policy chooses the appropriate counting lane and preserves the distinction between:

- aggregated matching-line totals,
- and search-family localization behavior.

This matters because `count_lines` must not silently drift into a second search endpoint.

---

## Scope and Traversal Model

### Explicit file paths

Explicit files are validated directly and then counted according to the resolved counting lane.

### Recursive directory scopes

Recursive directories first enter the shared traversal-governance model.

That means:

- default excluded trees still apply,
- optional `.gitignore` enrichment remains additive,
- include/exclude glob controls narrow the candidate surface,
- broad workloads may move from inline execution into completion-backed same-endpoint resume.

The endpoint-local docs must describe traversal admission as server-owned governance, not as an ad hoc local handler guess.

---

## Content-State and Unsupported-State Semantics

`count_lines` consumes the shared inspection-content taxonomy and the shared count-query policy.

The endpoint-local implications are:

- supported text-compatible surfaces may proceed,
- total-only and pattern-aware counting remain bounded counting operations,
- unsupported non-text states must not silently collapse into misleading ordinary counts or ambiguous empty results,
- pattern-aware unsupported states may surface explicit reroute guidance instead of pretending that no matches simply occurred.

This is one of the main differences between the current endpoint contract and the older simplified local convention wording.

---

## Structured Result Model

The structured result preserves per-path aggregation.

Each path result carries:

- `path`
- `files`
- `totalLines`
- `totalMatchingLines`

The batch result additionally carries:

- `totalFiles`
- `totalLines`
- `totalMatchingLines`
- `admission`
- `resume`

This means the endpoint is a structured counting surface rather than a flat single-number response.

At the file-entry level, each counted file may contribute:

- `file`
- `count`
- optional `matchingCount`

That optional `matchingCount` remains an aggregate count, not a location surface.

---

## Delivery and Resume Semantics

### Inline mode

When the workload remains bounded, the endpoint returns the full counting result inline.

### Completion-backed mode

When the workload leaves the inline lane:

- the server creates or continues a same-endpoint completion-backed session,
- the caller resumes with `resumeToken` and `resumeMode = 'complete-result'`,
- no preview-style chunk totals are exposed.

This is intentionally different from the preview-capable search and discovery families.

### Text-surface rule

When the endpoint is still waiting for completion-backed continuation, `content.text` may collapse to guidance while `structuredContent.admission` and `structuredContent.resume` remain authoritative.

Once the completion-backed result is finalized, the full bounded counting output returns through the normal text surface again.

---

## Relationship to Sibling Endpoints

### Versus `search_file_contents_by_regex`

`search_file_contents_by_regex` localizes matches, excerpts, and root-local failures for pattern search.

`count_lines` does not localize regex matches. It only aggregates how many lines match.

### Versus `search_file_contents_by_fixed_string`

`search_file_contents_by_fixed_string` localizes exact-match occurrences and excerpts.

`count_lines` remains the aggregate counting surface and must not drift into exact-match location reporting.

### Versus read surfaces

Read endpoints expose file content directly.

`count_lines` does not become a read endpoint merely because it traverses files or counts matching lines through a pattern-aware lane.

---

## Why This Endpoint Needs Local Documentation

The root documentation set owns the project-wide TOC and shared architecture references.

This endpoint-local description exists because `count_lines` has endpoint-specific behavior that cannot be explained precisely enough by root-level TOC text alone:

- the split between total-only and pattern-aware counting,
- structured per-path aggregation,
- completion-backed-only resume semantics,
- state-aware unsupported/reroute behavior,
- the distinction between counting and localization.

That endpoint-local detail belongs here, while broader cross-family ownership remains shared.
