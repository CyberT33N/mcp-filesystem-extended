# CONVENTIONS — `search_file_contents_by_regex` Endpoint

## Purpose of This Document

This document is the endpoint-local single source of truth for the non-obvious conventions, guardrails, and architectural boundaries of `search_file_contents_by_regex`.

Shared search-family rules now remain owned first by the family-level [`inspection/search` conventions](../CONVENTIONS.md), and then by the workspace-level conventions index plus the shared guardrail, content-classification, search-platform, and resume-architecture slices, especially [`public-limit-disclosure-governance.md`](../../../../../conventions/guardrails/public-limit-disclosure-governance.md). This file does not duplicate those broader rules. It explains how they apply specifically to the regex content-search surface.

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

### Family-owned threshold calibration

This endpoint is tuned by the search-family threshold policy from [`search-family-thresholds.ts`](../search-family-thresholds.ts).

The endpoint-specific calibrated values are:
- preview execution soft runtime budget = `4,500 ms`
- inline execution budget override = `12,000 ms`
- estimated per-candidate-file admission cost = `90 ms`

These values exist because the older regex admission posture was too preview-eager for moderate recursive code-search workloads.
Without this correction, realistic enterprise regex searches with compact final match surfaces would enter preview-first so early that many callers would immediately need a second `complete-result` request.

That is architecturally undesirable because it increases:
- reasoning churn,
- continuation-state handling,
- token usage across multiple turns,
- and the risk of partial-result misuse.

Regex remains intentionally stricter than fixed-string search.
The sibling fixed-string endpoint keeps a slightly more permissive inline posture because exact literal matching is narrower and operationally cheaper.

That `4,500 ms` value is a bounded preview-lane calibration only. It exists because include-glob-narrowed enterprise code search was still hitting the older `3,000 ms` wall before yielding a useful preview slice. The same correction must **not** be misread as permission for preview-family `complete-result` to inherit the legacy five-second local soft runtime timeout.

The same completion branch now also permits a materialized execution shape: remaining native-eligible candidates may be captured as one ordered completion plan and searched through one large or a few manifest-backed native `ugrep` batches, while decoded-text fallback files remain a smaller ordered side-lane. That is the architecture-correct way to remove per-directory native mini-batch fragmentation without losing additive frontier precision.

---

## Public Limit Disclosure Placement

`search_file_contents_by_regex` belongs to the preview-capable search family and follows the global public-limit-disclosure policy with a regex-search-specific emphasis.

### Parameter-description disclosure (required)

Stable request-shape limits belong in the schema-owned parameter descriptions because callers need them while constructing the request.

For `search_file_contents_by_regex`, that includes:

- scope-path length via `PATH_MAX_CHARS`
- scope-count ceiling via `MAX_REGEX_ROOTS_PER_REQUEST`
- regex-length ceiling via `REGEX_PATTERN_MAX_CHARS`
- include/exclude/reopened-descendant glob ceilings via `GLOB_PATTERN_MAX_CHARS`, `MAX_INCLUDE_GLOBS_PER_REQUEST`, and `MAX_EXCLUDE_GLOBS_PER_REQUEST`
- result-count ceiling via `REGEX_SEARCH_MAX_RESULTS_HARD_CAP`

The endpoint-local rule is therefore:

> Request-shape limits must be disclosed in [`schema.ts`](./schema.ts) through constant-backed parameter descriptions.

### Tool-description disclosure (required, mode-aware)

Stable operation-wide delivery rules belong in the runtime tool description because they shape caller planning for the full result surface.

For `search_file_contents_by_regex`, that includes:

- inline and `next-chunk` delivery remain bounded by the regex-search family response cap
- `complete-result` is additive and follows the shared global fuse instead of the regex-search family cap
- broad valid workloads may degrade into preview-first delivery, same-endpoint resume, or explicit narrowing guidance

The endpoint-local rule is therefore:

> Search-family response budgeting must be disclosed in the runtime tool description as a mode-aware contract, not as a blanket single-number rule.

### Non-prioritized internal limits (required non-disclosure rationale)

This endpoint must not promote the following internal or broader server-owned limits into its routine public tool description as if they were the primary caller target:

- the exact global fuse as the dominant optimization number
- traversal emergency-runtime ceilings
- dynamic lane-tier budgets
- internal admission and probe internals

Those surfaces remain owned by shared architecture conventions because they are server-internal execution-protection mechanics rather than the primary caller-actionable contract.

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
- preview-family `complete-result` does not inherit the local five-second soft runtime timeout
- endpoint-local docs must not describe `complete-result` as a cap bypass

### Single-execution response rule

This endpoint must not execute the same search twice in order to build `content.text` and `structuredContent` separately.

The architecturally correct rule is:
- one search execution,
- one shared result object,
- one formatted `content.text` surface derived from that result,
- and one mirrored `structuredContent` surface derived from that same result.

If the endpoint executes twice, resume state, truncation state, and root-local failure state can drift between the two surfaces.
That would violate the shared structured-content contract.

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
