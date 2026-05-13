# DESCRIPTION — `search_file_contents_by_regex` Endpoint

## Purpose

`search_file_contents_by_regex` performs regex-driven content matching across explicit file scopes or guarded directory-root traversal scopes.

It is the preview-capable search surface for callers that need match locations, excerpts, and same-endpoint continuation behavior when one inline response would be too broad.

Use this endpoint when the question is:

- where regex matches occur
- how many locations and matches were found across one or more roots
- whether a broad valid workload can continue through preview-first or `complete-result` behavior
- which root failed locally without collapsing sibling roots

Do not use this endpoint when the real need is literal-only matching, total-only counting, metadata lookup, or direct file-content reading.

This endpoint now lives under the shared [`inspection/search` family layer](../DESCRIPTION.md), which owns the family-wide preview-threshold philosophy, endpoint differentiation model, and the too-eager-preview problem statement.

---

## Request Model

### Base request surface

The base request is rooted in these fields:

- `roots`
- `regex`
- `includeGlobs`
- `excludeGlobs`
- `respectGitIgnore`
- `includeExcludedGlobs`
- `maxResults`
- `caseSensitive`

The important endpoint-local defaults are:

- `roots` must be present on base requests
- `regex` must be present on base requests
- `maxResults` defaults to `100`
- `caseSensitive` defaults to `false`

The public request contract exposes stable caller-actionable request limits directly on the parameter surface:

- scope paths remain bounded by the shared path-length cap
- the base request remains bounded by the shared regex-root ceiling
- the regex pattern remains bounded by the shared regex-length ceiling
- include, exclude, and reopened-descendant globs remain bounded by the shared glob and glob-count ceilings
- `maxResults` remains bounded by the shared regex-search result hard cap

### Resume request surface

Resume requests are intentionally separate from base requests.

- `resumeToken` identifies the persisted same-endpoint session
- `resumeMode` chooses `next-chunk` or `complete-result`
- resume-only requests reload the persisted request context instead of redefining it

This keeps the endpoint on one same-endpoint resume contract instead of creating a second public continuation tool.

---

## Scope and Eligibility Model

### Explicit-file scopes

An explicit file scope is searched directly after:

1. path validation
2. content-state classification
3. regex safety validation

Large explicit text-compatible files are not rejected only because they are large. They may proceed to the shared regex-search lane when the shared content-state and runtime policy allow it.

### Directory-root scopes

Directory-root scopes are different.

They first enter the shared traversal admission planner, which decides whether the workload is:

- `inline`
- `preview-first`
- `completion-backed-required`
- `narrowing-required`

This means recursive workload breadth is a server-owned admission question, not an endpoint-local ad hoc guess.

When `respectGitIgnore` is enabled, the recursive directory lane also applies directory-scoped hierarchical `.gitignore` layers beneath the validated requested root. Nested `.gitignore` files are resolved lazily during descent and affect only their own subtree.

When admission keeps a directory-root workload inline, the endpoint no longer depends only on one native process per file.
Validated native-searchable file candidates may now be grouped into ordered shell-free native `ugrep` batches, while decoded-text fallback and unsupported-surface handling still remain file-local.
That split preserves per-file eligibility truth without leaving the inline lane trapped in avoidable process-spawn fragmentation.

### Content-state eligibility

Regex search is a text-oriented operation and consumes the shared capability matrix.

In practice:

- `TEXT_CONFIDENT` may proceed
- `HYBRID_TEXT_DOMINANT` may proceed
- `HYBRID_BINARY_DOMINANT`, `BINARY_CONFIDENT`, and `UNKNOWN_LARGE_SURFACE` are refused for regex search

This keeps regex text-first even though the shared content-state taxonomy is richer than a simple text/binary boolean.

---

## Runtime Execution Model

### Primary backend

The endpoint’s primary runtime lane is the shared regex-search backend built around `ugrep`.

That means the target-state regex endpoint is not documented as a legacy full-string JavaScript search surface. The endpoint documentation must describe the current shared regex lane instead.

### Decoded-text fallback

When the shared capability layer resolves a supported text-compatible encoding that requires decoded-text fallback, the endpoint may collect matches from decoded text rather than rejecting the file.

This is important for supported text surfaces whose raw bytes are not best handled through the ordinary native lane alone.

### Runtime safety

The endpoint keeps structural regex safety active before runtime execution proceeds.

Unsafe patterns are rejected as explicit policy outcomes rather than being allowed to degrade into unstable runtime behavior.

That request-level safety is lane-aware:

- the pattern must compile under the local JavaScript regex guardrail used for zero-length protection and local match extraction
- the pattern must also be classifiable onto the selected native `ugrep` lane
- backend-lane feature requirements such as lookahead or lookbehind must be resolved before any root execution begins

If a pattern cannot satisfy that combined contract, the endpoint raises a request-wide guardrail failure instead of surfacing a root-local runtime error.

### Endpoint-local threshold calibration

This endpoint consumes the family-owned threshold surface from [`search-family-thresholds.ts`](../search-family-thresholds.ts).

Its current endpoint-specific values are:
- preview execution soft runtime budget = `4,500 ms`
- inline execution budget override = `12,000 ms`
- estimated per-candidate-file admission cost = `90 ms`

These values are intentionally stricter than fixed-string search but materially less preview-eager than the earlier posture.
The goal is to stop moderate recursive code-search workloads from falling into preview-first so early that many callers immediately need a second `complete-result` request, while also allowing valid include-glob-narrowed enterprise TypeScript and TSX search to reach a useful preview slice instead of failing at the older `3,000 ms` wall.

---

## Response Model

### Per-root structured surface

The structured response preserves one result object per root:

- `root`
- `matches`
- `filesSearched`
- `totalMatches`
- `truncated`
- `error`

This per-root model is what allows the endpoint to preserve root-local failures without discarding successful sibling roots in the same request.

### Match surface

Each collected match carries:

- `file`
- `line`
- `content`
- `match`

This is a localization surface, not just a count surface.

### Aggregate batch surface

The top-level result also carries:

- `totalLocations`
- `totalMatches`
- `truncated`
- `admission`
- `resume`

`totalLocations` tracks emitted match locations, while `totalMatches` tracks aggregate matches encountered across roots before all bounded shaping completed.

---

## Public Limit Disclosure Model

For this endpoint, limit disclosure is intentionally split across two public surfaces.

### Parameter surface

Parameter descriptions carry the stable request-shape limits that callers need while constructing the request:

- path-length limits
- maximum scope count
- regex-length limit
- include/exclude/reopened-descendant glob ceilings
- result-count ceiling for `maxResults`

### Tool-description surface

The runtime tool description carries the stable operation-wide delivery rule:

- inline and `next-chunk` delivery remain bounded by the regex-search family response cap
- `complete-result` is additive and follows the shared global fuse instead of the regex-search family cap
- broad valid workloads may still degrade into preview-first delivery, same-endpoint resume, or narrowing guidance

### Intentional non-disclosure in routine tool text

The routine tool description does not prioritize:

- the exact global fuse as the primary planning number
- traversal emergency-runtime ceilings
- dynamic lane-tier budgets
- internal admission and probe internals

Those surfaces remain owned by shared architecture conventions because they are server-internal execution-protection mechanics rather than the primary caller-actionable contract.

---

## Continuation and Resume Semantics

This endpoint is preview-capable.

### `next-chunk`

Use `resumeMode = 'next-chunk'` when the caller wants the next bounded preview slice of the same search session.

### `complete-result`

Use `resumeMode = 'complete-result'` when the caller wants the server to continue the same persisted session toward a final complete result.

`complete-result` does not bypass guardrails. It changes the delivery intent while keeping the same server-owned session and the same global final fuse.

For this preview-capable family, `complete-result` also does not inherit the local five-second soft runtime timeout that belongs to bounded preview execution. The caller-visible completion ceiling is the shared global fuse.

### Continuation guidance placement

When the response is resumable:

- full primary result data still appears in `content.text`
- continuation guidance is appended after the full result data
- `structuredContent.admission` and `structuredContent.resume` remain the authoritative machine-readable envelope

This keeps text-only consumers and structured consumers aligned on the same logical result.

---

## Large-Workload Behavior

The endpoint distinguishes between unsupported workloads and broad valid workloads.

### Broad valid workloads

Broad valid workloads may degrade into:

- preview-first bounded delivery
- `complete-result` continuation behavior
- explicit narrowing guidance when even the bounded lane cannot proceed safely

### Unsupported workloads

Unsupported workloads still refuse.

Examples include:

- unsupported content states
- structurally unsafe regex patterns
- workloads that exceed the admitted lane boundaries

This distinction matters because the architecture must not collapse every large workload into the same refusal story.

---

## Root-Local Failure Semantics

One of the most important local behaviors of this endpoint is root-local failure capture.

### What it means

- one failing root may surface an `error`
- a different root in the same request may still return matches
- the whole request is not forced into one global failure merely because one root failed operationally

### What it does not mean

- request-wide regex contract failures are not downgraded into root-local `error` payloads
- backend-lane pattern mismatches must fail before the per-root traversal loop continues

### Why it matters

Autonomous agents need to distinguish:

- no matches
- partial root failure
- request-wide regex contract rejection
- broad workload continuation
- hard refusal

The per-root result structure makes those distinctions explicit.

---

## Relationship to Other Inspection Surfaces

### Versus `search_file_contents_by_fixed_string`

`search_file_contents_by_fixed_string` is the literal-search sibling.

`search_file_contents_by_regex` owns regex semantics, structural regex safety, and regex-specific content matching behavior.

### Versus `count_lines`

`count_lines` is a counting surface. It does not expose preview-style partial totals.

`search_file_contents_by_regex` localizes matches and can operate through preview-first or `complete-result` continuation behavior when broad valid workloads leave the inline lane.

### Versus read surfaces

Read surfaces expose file content directly.

`search_file_contents_by_regex` exposes match localization and bounded search-session behavior instead.

---

## Why This Endpoint Needs Local Documentation

The root documentation set owns the project-wide TOC and shared architecture references.

This endpoint-local description exists because `search_file_contents_by_regex` has endpoint-specific behavior that cannot be explained precisely enough by root-level TOC text alone:

- explicit-file versus directory-root search distinction
- shared content-state eligibility as it applies to regex search
- per-root match and failure structure
- preview-capable same-endpoint resume behavior
- text-first regex semantics without unrestricted hybrid support
- family-cap versus global-fuse behavior for continuation-aware output
- directory-scoped hierarchical `.gitignore` participation beneath the validated traversal root

That endpoint-local detail belongs here, while broader cross-family ownership remains shared.
