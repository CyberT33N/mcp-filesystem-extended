# CONVENTIONS — `search_file_contents_by_fixed_string` Endpoint

## Purpose of This Document

This document is the endpoint-local single source of truth for the non-obvious conventions, guardrails, and architectural boundaries of `search_file_contents_by_fixed_string`.

Shared cross-family rules remain owned by the workspace-level conventions index and the shared guardrail, content-classification, search-platform, and resume-architecture slices. This file does not duplicate those broader rules. It explains how they apply specifically to the literal content-search surface.

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

### Response-cap rule

- family-level response caps remain authoritative for inline and `next-chunk`,
- `complete-result` uses the global fuse as the effective final ceiling instead of the family cap,
- endpoint-local docs must not describe `complete-result` as a cap bypass.

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
