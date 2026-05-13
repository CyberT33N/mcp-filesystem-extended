# DESCRIPTION — `search_file_contents_by_fixed_string` Endpoint

## Purpose

`search_file_contents_by_fixed_string` performs exact fixed-string content matching across explicit file scopes or guarded directory-root traversal scopes.

It is the preview-capable literal-search surface for callers that need exact-match locations, caller-visible excerpts, and same-endpoint continuation behavior when one inline response would be too broad.

Use this endpoint when the question is:

- where an exact value occurs,
- how many locations and matches were found across one or more roots,
- whether a broad valid workload can continue through preview-first or `complete-result` behavior,
- which root failed locally without collapsing sibling roots.

Do not use this endpoint when the real need is regex-driven matching, total-only counting, metadata lookup, or direct file-content reading.

This endpoint now lives under the shared [`inspection/search` family layer](../DESCRIPTION.md), which owns the family-wide preview-threshold philosophy, endpoint differentiation model, and the too-eager-preview problem statement.

---

## Request Model

### Base request surface

The base request is rooted in these fields:

- `roots`
- `fixedString`
- `includeGlobs`
- `excludeGlobs`
- `respectGitIgnore`
- `includeExcludedGlobs`
- `maxResults`
- `caseSensitive`

The important endpoint-local defaults are:

- `roots` must be present on base requests,
- `fixedString` must be present on base requests,
- `maxResults` defaults to `100`,
- `caseSensitive` defaults to `false`.

The public request contract exposes stable caller-actionable request limits directly on the parameter surface:

- scope paths remain bounded by the shared path-length cap
- the base request remains bounded by the shared regex-root ceiling
- the fixed-string pattern remains bounded by the shared short-text ceiling
- include, exclude, and reopened-descendant globs remain bounded by the shared glob and glob-count ceilings
- `maxResults` remains bounded by the shared regex-search result hard cap

### Resume request surface

Resume requests are intentionally separate from base requests.

- `resumeToken` identifies the persisted same-endpoint session,
- `resumeMode` chooses `next-chunk` or `complete-result`,
- resume-only requests reload the persisted request context instead of redefining it.

This keeps the endpoint on one same-endpoint resume contract instead of creating a second public continuation tool.

---

## Scope and Eligibility Model

### Explicit-file scopes

An explicit file scope is searched directly after:

1. path validation,
2. content-state classification,
3. literal-search runtime safety.

Large explicit text-compatible files are not rejected only because they are large. They may proceed to the shared fixed-string lane when the shared content-state and runtime policy allow it.

### Directory-root scopes

Directory-root scopes are different.

They first enter the shared traversal admission planner, which decides whether the workload is:

- `inline`,
- `preview-first`,
- `completion-backed-required`,
- `narrowing-required`.

This means recursive workload breadth is a server-owned admission question, not an endpoint-local ad hoc guess.

When `respectGitIgnore` is enabled, the recursive directory lane also applies directory-scoped hierarchical `.gitignore` layers beneath the validated requested root. Nested `.gitignore` files are resolved lazily during descent and affect only their own subtree.

When admission keeps a directory-root workload inline, the endpoint no longer depends only on one native process per file.
Validated native-searchable file candidates may now be grouped into ordered shell-free native `ugrep` batches, while decoded-text fallback and unsupported-surface handling still remain file-local.
That split preserves per-file eligibility truth without leaving the inline lane trapped in avoidable process-spawn fragmentation.

### Content-state eligibility

Fixed-string search is a text-oriented operation and consumes the shared capability matrix.

In practice:

- supported text-compatible surfaces may proceed,
- text-dominant hybrid surfaces may proceed when the shared classifier keeps them in the searchable lane,
- unsupported pure-binary, binary-dominant, or otherwise non-text-compatible surfaces still refuse.

This keeps the endpoint compatible with hybrid-searchable literal workloads without turning it into a generic binary search surface.

---

## Runtime Execution Model

### Primary backend

The endpoint’s primary runtime lane is the shared fixed-string backend built around `ugrep`.

That means the target-state fixed-string endpoint is not documented as a legacy whole-file JavaScript search surface. The endpoint documentation must describe the current shared literal lane instead.

### Preferred literal lane for hybrid-searchable workloads

When a caller needs exact value verification rather than pattern matching, this endpoint is the preferred search lane for supported text-compatible and text-dominant hybrid surfaces.

That preference exists because:

- exact string matching is narrower than regex-driven intent,
- the shared literal lane is shaped for caller-safe excerpt output,
- and the endpoint still preserves the refusal boundary for unsupported binary-only surfaces.

### Runtime safety and shaping

The endpoint keeps runtime shaping active before caller-visible text is emitted.

That means:
- exact-match locations are collected through the shared literal lane,
- bounded excerpts are preserved for caller-visible output,
- resumable responses remain constrained by shared resume and response-budget rules.

### Endpoint-local threshold calibration

This endpoint consumes the family-owned threshold surface from [`search-family-thresholds.ts`](../search-family-thresholds.ts).

Its current endpoint-specific values are:
- preview execution soft runtime budget = `4,500 ms`
- inline execution budget override = `14,000 ms`
- estimated per-candidate-file admission cost = `60 ms`

These values are intentionally more permissive than regex search while still correcting the older too-eager-preview posture.
The goal is to let moderate recursive literal-search workloads remain inline more often without erasing preview-first for genuinely broad workloads, while still allowing valid include-glob-narrowed enterprise TypeScript and TSX search to reach a useful preview slice instead of failing at the older `3,000 ms` wall.

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

`totalLocations` tracks emitted match locations, while `totalMatches` tracks aggregate literal matches encountered across roots before all bounded shaping completed.

---

## Public Limit Disclosure Model

For this endpoint, limit disclosure is intentionally split across two public surfaces.

### Parameter surface

Parameter descriptions carry the stable request-shape limits that callers need while constructing the request:

- path-length limits
- maximum scope count
- fixed-string-length limit
- include/exclude/reopened-descendant glob ceilings
- result-count ceiling for `maxResults`

### Tool-description surface

The runtime tool description carries the stable operation-wide delivery rule:

- inline and `next-chunk` delivery remain bounded by the fixed-string search-family response cap
- `complete-result` is additive and follows the shared global fuse instead of the fixed-string search-family cap
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

Use `resumeMode = 'next-chunk'` when the caller wants the next bounded preview slice of the same literal-search session.

### `complete-result`

Use `resumeMode = 'complete-result'` when the caller wants the server to continue the same persisted session toward a final complete result.

`complete-result` does not bypass guardrails. It changes the delivery intent while keeping the same server-owned session and the same global final fuse.

For this preview-capable family, `complete-result` also does not inherit the local five-second soft runtime timeout that belongs to bounded preview execution. The caller-visible completion ceiling is the shared global fuse.

### Continuation guidance placement

When the response is resumable:

- full primary result data still appears in `content.text`,
- continuation guidance is appended after the full result data,
- `structuredContent.admission` and `structuredContent.resume` remain the authoritative machine-readable envelope.

This keeps text-only consumers and structured consumers aligned on the same logical result.

---

## Large-Workload Behavior

The endpoint distinguishes between unsupported workloads and broad valid workloads.

### Broad valid workloads

Broad valid workloads may degrade into:

- preview-first bounded delivery,
- `complete-result` continuation behavior,
- explicit narrowing guidance when even the bounded lane cannot proceed safely.

### Unsupported workloads

Unsupported workloads still refuse.

Examples include:

- unsupported content states,
- invalid path or scope configurations,
- workloads that exceed the admitted lane boundaries.

This distinction matters because the architecture must not collapse every large workload into the same refusal story.

---

## Root-Local Failure Semantics

One of the most important local behaviors of this endpoint is root-local failure capture.

### What it means

- one failing root may surface an `error`,
- a different root in the same request may still return matches,
- the whole request is not forced into one global failure merely because one root failed operationally.

### Why it matters

Autonomous agents need to distinguish:

- no matches,
- partial root failure,
- broad workload continuation,
- hard refusal.

The per-root result structure makes those distinctions explicit.

---

## Relationship to Other Inspection Surfaces

### Versus `search_file_contents_by_regex`

`search_file_contents_by_regex` is the pattern-search sibling.

`search_file_contents_by_fixed_string` owns exact literal semantics and is the better fit when the target value is already known.

### Versus `count_lines`

`count_lines` is a counting surface. It does not expose preview-style partial totals.

`search_file_contents_by_fixed_string` localizes exact matches and can operate through preview-first or `complete-result` continuation behavior when broad valid workloads leave the inline lane.

### Versus read surfaces

Read surfaces expose file content directly.

`search_file_contents_by_fixed_string` exposes bounded exact-match localization and continuation-aware search behavior instead.

---

## Why This Endpoint Needs Local Documentation

The root documentation set owns the project-wide TOC and shared architecture references.

This endpoint-local description exists because `search_file_contents_by_fixed_string` has endpoint-specific behavior that cannot be explained precisely enough by root-level TOC text alone:

- exact literal matching instead of regex semantics,
- explicit-file versus directory-root search distinction,
- shared content-state eligibility as it applies to literal search,
- preferred literal-lane positioning for supported hybrid-searchable workloads,
- per-root match and failure structure,
- preview-capable same-endpoint resume behavior,
- directory-scoped hierarchical `.gitignore` participation beneath the validated traversal root.

That endpoint-local detail belongs here, while broader cross-family ownership remains shared.
