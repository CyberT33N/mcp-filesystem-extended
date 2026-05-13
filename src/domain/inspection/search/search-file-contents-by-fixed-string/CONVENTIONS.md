# CONVENTIONS — `search_file_contents_by_fixed_string` Endpoint

## Purpose of This Document

This document is the endpoint-local single source of truth for the non-obvious conventions, guardrails, and architectural boundaries of `search_file_contents_by_fixed_string`.

Shared search-family rules now remain owned first by the family-level [`inspection/search` conventions](../CONVENTIONS.md), and then by the workspace-level conventions index plus the shared guardrail, content-classification, search-platform, and resume-architecture slices, especially [`public-limit-disclosure-governance.md`](../../../../../conventions/guardrails/public-limit-disclosure-governance.md). This file does not duplicate those broader rules. It explains how they apply specifically to the literal content-search surface.

---

## What This Endpoint Is

`search_file_contents_by_fixed_string` is the preview-capable literal content-search surface for exact string matching across explicit file scopes or guarded directory-root traversal scopes.

Its contract is:

> Validate the requested scopes, determine whether candidate file surfaces are text-compatible enough for literal search, execute exact fixed-string matching through the shared literal lane, preserve root-local failures, and surface bounded match payloads together with same-endpoint resume metadata when the workload leaves the inline lane.

This endpoint is intentionally distinct from adjacent inspection surfaces:

- It does **not** perform regex-driven matching.
- It does **not** read file bodies as the primary business result.
- It does **not** enumerate directory entries as its primary business result.
- It does **not** count lines as its primary business question.

Instead, it answers one question only:

> Where do the requested exact fixed-string matches occur across the requested file or directory scopes, and how does the bounded search session continue if the result is too broad for one inline response?

---

## Request-Surface Conventions

### Base requests

- Base requests must provide at least one value in `roots`.
- Base requests must provide `fixedString`.
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

- Explicit file scopes are searched directly after path validation, content-state classification, and literal-search runtime safety succeed.
- Directory-root scopes enter the shared traversal admission planner before broad traversal begins.
- Recursive aggregate governance must not be described as a blanket hard refusal for explicit large text-compatible files.

---

## Literal-Lane and Content-State Conventions

### Shared content-state authority

Fixed-string search consumes the shared content-classification and capability model rather than a local text/binary heuristic.

The endpoint-local implications are:

- supported text-compatible states may proceed to the shared literal lane,
- text-dominant hybrid surfaces remain eligible when the shared classifier resolves them as safe for content-oriented search,
- pure binary, binary-dominant, or otherwise unsupported surfaces still refuse,
- and the endpoint must not be documented as a generic unrestricted binary-search surface.

### Preferred literal-search lane rule

- This endpoint is the preferred lane when the caller already knows the exact value that must be matched.
- That preference matters especially for supported hybrid-searchable workloads where literal verification is clearer and cheaper than regex-driven pattern work.
- The docs must describe this as a literal-search specialization, not as a broader capability claim than the current code and shared guardrails support.

### Text-first rule with hybrid-safe positioning

- Fixed-string search remains a text-oriented operation.
- The richer shared taxonomy does **not** authorize arbitrary binary inspection.
- The endpoint-local docs must explain that supported text-compatible and text-dominant hybrid surfaces may proceed, while unsupported pure-binary surfaces still refuse.

---

## Runtime Lane Conventions

### Primary backend rule

`ugrep` is the primary backend for fixed-string search.

That means:

- literal search uses the shared fixed-string lane,
- endpoint-local docs must not present legacy in-process whole-file JavaScript searching as the authoritative search model,
- and the endpoint must be described from the current runtime lane rather than from historical plan wording.

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

The fixed-string endpoint-local docs must explain that broad valid workloads may degrade into preview-first or server-owned completion behavior, while unsupported surfaces, invalid scopes, or over-hard-gap workloads still refuse.

### Family-owned threshold calibration

This endpoint is tuned by the search-family threshold policy from [`search-family-thresholds.ts`](../search-family-thresholds.ts).

The endpoint-specific calibrated values are:
- preview execution soft runtime budget = `4,500 ms`
- inline execution budget override = `14,000 ms`
- estimated per-candidate-file admission cost = `60 ms`

These values exist because the older fixed-string admission posture was also too preview-eager for moderate recursive code-search workloads, even though fixed-string search is narrower than regex.
Without this correction, the endpoint would still enter preview-first too early for many enterprise literal-search workloads where callers usually want the complete result set.

Fixed-string remains intentionally more permissive than regex.
That differentiation is required because exact literal matching is narrower, cheaper, and more likely to justify inline completion when the projected caller-visible result surface stays compact.

That `4,500 ms` value belongs only to the bounded preview lane. It exists because include-glob-narrowed enterprise literal search was still hitting the older `3,000 ms` wall before yielding a useful preview slice. The preview-family completion branch must not inherit the legacy five-second local soft runtime timeout.

The same completion branch now also permits a materialized execution shape: remaining native-eligible candidates may be captured as one ordered completion plan and searched through one large or a few manifest-backed native `ugrep` batches, while decoded-text fallback files remain a smaller ordered side-lane. That is the architecture-correct way to remove per-directory native mini-batch fragmentation without losing additive frontier precision.

---

## Public Limit Disclosure Placement

`search_file_contents_by_fixed_string` belongs to the preview-capable search family and follows the global public-limit-disclosure policy with a literal-search-specific emphasis.

### Parameter-description disclosure (required)

Stable request-shape limits belong in the schema-owned parameter descriptions because callers need them while constructing the request.

For `search_file_contents_by_fixed_string`, that includes:

- scope-path length via `PATH_MAX_CHARS`
- scope-count ceiling via `MAX_REGEX_ROOTS_PER_REQUEST`
- fixed-string-length ceiling via `SHORT_TEXT_MAX_CHARS`
- include/exclude/reopened-descendant glob ceilings via `GLOB_PATTERN_MAX_CHARS`, `MAX_INCLUDE_GLOBS_PER_REQUEST`, and `MAX_EXCLUDE_GLOBS_PER_REQUEST`
- result-count ceiling via `REGEX_SEARCH_MAX_RESULTS_HARD_CAP`

The endpoint-local rule is therefore:

> Request-shape limits must be disclosed in [`schema.ts`](./schema.ts) through constant-backed parameter descriptions.

### Tool-description disclosure (required, mode-aware)

Stable operation-wide delivery rules belong in the runtime tool description because they shape caller planning for the full result surface.

For `search_file_contents_by_fixed_string`, that includes:

- inline and `next-chunk` delivery remain bounded by the fixed-string search-family response cap
- `complete-result` is additive and follows the shared global fuse instead of the fixed-string search-family cap
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

This split is required because multi-root fixed-string search supports root-local failure capture without collapsing the full request into one undifferentiated error.

### Match surface

Each collected match carries:

- `file`
- `line`
- `content`
- `match`

This is a localization surface, not just a count surface.

### Aggregate result model

The batch surface additionally owns:

- `totalLocations`
- `totalMatches`
- `truncated`
- `admission`
- `resume`

`totalLocations` is not the same thing as `totalMatches`. One emitted location is one caller-visible excerpt, while `totalMatches` reflects aggregate literal matches encountered before all bounded shaping completed.

### Root-local error rule

- `error` is root-local.
- Multi-root requests may therefore contain successful roots and failed roots in the same structured response.
- The endpoint-local docs must not imply that one root failure invalidates sibling roots automatically.

---

## Text-Surface Conventions

### Primary data rule

`content.text` remains the primary information carrier.

That means:

- full caller-visible match data appears in `content.text`,
- continuation guidance is appended after the data when the response is resumable,
- and `structuredContent` mirrors the result while owning the machine-readable `admission` / `resume` envelope.

### Continuation-aware formatting rule

When the response is resumable:

- the full match payload still appears in `content.text`,
- a continuation block is appended afterward,
- the continuation block must not replace the primary result data with compact summary text only.
- if bounded preview execution already reached matches before the runtime checkpoint, those matches must remain visible in the first preview response
- if bounded preview execution reached zero matches so far, the response must say "no matches reached yet in this bounded preview slice" instead of implying final absence for the full workload

### Response-cap rule

- family-level response caps remain authoritative for inline and `next-chunk`,
- `complete-result` uses the global fuse as the effective final ceiling instead of the family cap,
- preview-family `complete-result` does not inherit the local five-second soft runtime timeout,
- endpoint-local docs must not describe `complete-result` as a cap bypass.

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

### Compared with `search_file_contents_by_regex`

`search_file_contents_by_regex` is the pattern-search sibling.

`search_file_contents_by_fixed_string` owns exact literal matching where callers know the target value in advance and want the narrower literal lane instead of regex semantics.

### Compared with `count_lines`

`count_lines` is the bounded counting surface.

`search_file_contents_by_fixed_string` localizes literal matches and supports preview-style partial delivery. `count_lines` does not expose preview-style partial totals.

### Selection rule

Use `search_file_contents_by_fixed_string` when the caller needs:

- exact string matching,
- match locations with excerpts,
- preview-first or completion-result continuation behavior for broad valid workloads,
- the preferred literal lane for supported hybrid-searchable content.

Do not use it as a substitute for regex-driven matching, total-only counting, metadata lookup, or file-content reading workflows.

---

## Local Documentation Ownership Split

The endpoint-local documentation triplet is intentionally split by role:

- `CONVENTIONS.md` owns endpoint-local conventions, guardrails, and policy boundaries
- `DESCRIPTION.md` owns the detailed endpoint architecture for LLM-agent use
- `README.md` owns the concise developer-facing summary

Root-level documentation is expected to re-reference this endpoint-local triplet later. This file must therefore stay endpoint-local and must not drift into root-level TOC ownership.
