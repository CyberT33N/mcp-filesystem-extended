# CONVENTIONS — `find_files_by_glob` Endpoint

## Purpose of This Document

This document is the endpoint-local single source of truth for the non-obvious conventions, guardrails, and architectural boundaries of `find_files_by_glob`.

Shared cross-family rules remain owned by the workspace-level conventions index and the shared search-platform, guardrail, and resume-architecture slices. This file does not duplicate those broader rules. It explains how they apply specifically to the glob-based discovery surface.

---

## What This Endpoint Is

`find_files_by_glob` is the flat glob-driven discovery surface for root-scoped path matching.

Its contract is:

> Traverse one or more requested roots, evaluate a caller-supplied glob against relative traversal paths, and return root-local matches with explicit truncation and resume metadata when breadth requires bounded delivery.

This endpoint is intentionally distinct from adjacent inspection surfaces:

- It does **not** preserve directory shape like `list_directory_entries`.
- It does **not** use plain case-insensitive substring semantics like `find_paths_by_name`.
- It does **not** inspect file body content like the regex or fixed-string search families.
- It does **not** read full file content.

Instead, it answers one question only:

> Which paths beneath these roots match the requested glob under the shared traversal policy?

---

## Request-Surface Conventions

### Base requests

- Base requests must provide at least one value in `roots`.
- Base requests must provide `glob`.
- `glob` is a path-oriented pattern applied beneath each requested root. It is not a regex and not a plain substring filter.
- `excludeGlobs` is additive and narrows traversal.
- `includeExcludedGlobs` reopens explicitly named descendants without widening the full traversal baseline.
- `respectGitIgnore` is optional and secondary. It layers root-local `.gitignore` rules on top of the server-owned traversal policy rather than replacing it.
- `maxResults` limits retained matches per root before truncation is reported.

### Resume-only requests

- Resume-only requests stay on the same endpoint.
- Resume-only requests send only `resumeToken` plus the chosen `resumeMode`.
- Query-defining fields from the base request are not resent on resume-only requests.

---

## Match and Result Conventions

### Glob-matching semantics

- Matching is evaluated against relative traversal paths beneath each requested root.
- Matching is glob-based rather than substring-based.
- The endpoint is file-discovery-oriented and returns flat path matches grouped by root.
- Returned matches are full filesystem paths, while grouping is preserved by requested root.

### Structured result shape

The structured response keeps one result object per requested root:

- `root` repeats the requested root.
- `matches` contains flat path matches for that root.
- `truncated` indicates that root-local collection stopped at the effective match ceiling or bounded frontier.

The aggregate result also exposes:

- `totalMatches`
- aggregate `truncated`
- `admission`
- `resume`

### Stable ordering

Traversal reads directory entries in deterministic lexicographic order, and the collected match list is sorted before return. This keeps repeated results stable across the same filesystem state and makes resume/frontier behavior predictable.

---

## Traversal-Scope Conventions

`find_files_by_glob` inherits the shared traversal-scope policy and applies it as a glob-based discovery surface.

The endpoint-specific implications are:

- Broad roots exclude default vendor, cache, and generated trees by default.
- Explicit roots inside excluded trees remain valid.
- Additive descendant reopening stays narrow and must use `includeExcludedGlobs`.
- Optional `.gitignore` participation remains secondary.
- Narrowing roots or tightening `glob` remains the first-class way to reduce workload.

This endpoint must not imply that callers can bypass the shared traversal hardening baseline by default. The additive controls reopen named descendants only within that existing server-owned policy.

---

## Admission, Resume, and Output-Shaping Conventions

`find_files_by_glob` belongs to the preview-capable discovery families.

Its caller-visible conventions are:

- broad valid discovery workloads may degrade into preview-first delivery
- the same endpoint supports `resumeMode = 'next-chunk'`
- the same endpoint supports `resumeMode = 'complete-result'`
- no second continuation endpoint exists
- scope reduction remains a first-class alternative to resume

### Authority split between structured and text surfaces

When additive `admission` and `resume` metadata are present:

- `structuredContent.admission` is the authoritative machine-readable admission envelope
- `structuredContent.resume` is the authoritative machine-readable resume envelope
- the current bounded match payload remains complete in `content.text`
- any mirrored structured result data must not replace `content.text`

### Additive `complete-result` rule

`complete-result` is additive, not redundant.

The server continues from the persisted traversal frontier instead of replaying the already-delivered preview chunk. Callers must combine the earlier preview payload with the later completion payload to reconstruct the complete dataset.

### Mode-aware response-budget rule

This discovery family uses the shared discovery response cap for inline and `next-chunk` delivery, but `complete-result` follows the global response fuse instead of the family cap. That rule is shared and must be applied here exactly as documented in the guardrail/resume convention slices rather than being redefined locally.

---

## Handler-Owned Traversal Conventions

For this endpoint, the recursive traversal model is owned directly by the endpoint handler rather than by a separate helper module.

That means the local documentation must describe these handler-owned responsibilities precisely:

- traversal preflight and admission consumption
- relative-path glob evaluation
- path validation for visited entries
- traversal-scope enforcement
- runtime-budget tracking
- continuation-state progression

This matters because endpoint-local documentation must not describe this endpoint as helper-owned when the handler is the runtime owner of the traversal loop.

---

## Relationship to Sibling Discovery Endpoints

### Compared with `find_paths_by_name`

`find_paths_by_name` answers a plain substring question over entry names.

`find_files_by_glob` answers a glob-selection question over relative traversal paths.

### Compared with `list_directory_entries`

`list_directory_entries` preserves structure and grouped metadata.

`find_files_by_glob` returns flat matches grouped by requested root.

### Compared with content-search endpoints

Regex and fixed-string search inspect file bodies.

`find_files_by_glob` never inspects file body content. It stops at path discovery.

---

## Local Documentation Ownership Split

The endpoint-local documentation triplet is intentionally split by role:

- [`CONVENTIONS.md`](./CONVENTIONS.md) owns endpoint-local conventions, guardrails, and policy boundaries
- [`DESCRIPTION.md`](./DESCRIPTION.md) owns the detailed endpoint architecture for LLM-agent use
- [`README.md`](./README.md) owns the concise developer-facing summary

Root-level documentation is expected to re-reference this endpoint-local triplet later. This file must therefore stay endpoint-local and must not drift into root-level TOC ownership.
