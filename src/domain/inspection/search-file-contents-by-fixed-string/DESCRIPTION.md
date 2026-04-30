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

## Continuation and Resume Semantics

This endpoint is preview-capable.

### `next-chunk`

Use `resumeMode = 'next-chunk'` when the caller wants the next bounded preview slice of the same literal-search session.

### `complete-result`

Use `resumeMode = 'complete-result'` when the caller wants the server to continue the same persisted session toward a final complete result.

`complete-result` does not bypass guardrails. It changes the delivery intent while keeping the same server-owned session and the same global final fuse.

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
- preview-capable same-endpoint resume behavior.

That endpoint-local detail belongs here, while broader cross-family ownership remains shared.
