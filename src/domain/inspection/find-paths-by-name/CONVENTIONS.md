# CONVENTIONS — `find_paths_by_name` Endpoint

## Purpose of This Document

This document is the endpoint-local single source of truth for the non-obvious conventions, guardrails, and architectural boundaries of `find_paths_by_name`.

Shared cross-family rules remain owned by the workspace-level conventions index and the shared guardrail and resume-architecture slices. This file does not duplicate those broader rules. It explains how they apply specifically to the name-based path discovery surface.

---

## What This Endpoint Is

`find_paths_by_name` is the flat path-discovery surface for case-insensitive name-substring matching.

Its contract is:

> Traverse one or more requested roots, match file and directory entry names by case-insensitive substring, and return flat path matches grouped by requested root.

This endpoint is intentionally distinct from adjacent inspection surfaces:

- It does **not** preserve directory shape like `list_directory_entries`.
- It does **not** use glob semantics like `find_files_by_glob`.
- It does **not** inspect file body content like the regex or fixed-string search families.
- It does **not** read full file content.

Instead, it answers one question only:

> Which filesystem paths beneath these roots have file or directory names that contain the requested substring?

---

## Request-Surface Conventions

### Base requests

- Base requests must provide at least one value in `roots`.
- Base requests must provide `nameContains`.
- `nameContains` is a plain-text, case-insensitive substring filter over entry names. It is not a regex and not a glob.
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

### Name-matching semantics

- Matching is performed against the filesystem entry name, not against file contents.
- Matching is case-insensitive.
- Both files and directories may match because both surface an entry name during traversal.
- Returned matches are full filesystem paths, while grouping is preserved by requested root.

### Structured result shape

The structured response keeps one result object per requested root:

- `root` repeats the requested root.
- `matches` contains flat path matches for that root.
- `truncated` indicates that root-local collection stopped at the effective match ceiling.

The aggregate result also exposes:

- `totalMatches`
- aggregate `truncated`
- `admission`
- `resume`

### Stable ordering

Directory entries are read in deterministic lexicographic order. This keeps repeated results stable across the same filesystem state and makes resume/frontier behavior predictable.

---

## Traversal-Scope Conventions

`find_paths_by_name` inherits the shared traversal-scope policy and applies it as a name-discovery surface.

The endpoint-specific implications are:

- Broad roots exclude default vendor, cache, and generated trees by default.
- Explicit roots inside excluded trees remain valid.
- Additive descendant reopening stays narrow and must use `includeExcludedGlobs`.
- Optional `.gitignore` participation remains secondary.
- Narrowing roots or tightening `nameContains` remains the first-class way to reduce workload.

This endpoint must not imply that callers can bypass the shared traversal hardening baseline by default. The additive controls reopen named descendants only within that existing server-owned policy.

---

## Admission, Resume, and Output-Shaping Conventions

`find_paths_by_name` belongs to the preview-capable discovery families.

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

## Helper-Owned Traversal Conventions

The endpoint contract is split intentionally between handler and helper responsibilities:

- the handler owns the public request/response surface and text formatting behavior
- the helper owns recursive traversal, path validation per visited entry, traversal-scope enforcement, runtime-budget tracking, admission consumption, and continuation-state progression

This matters because endpoint-local documentation must describe helper-owned traversal behavior precisely without pretending that the handler alone owns the full runtime model.

---

## Relationship to Sibling Discovery Endpoints

### Compared with `list_directory_entries`

`list_directory_entries` answers a structure-and-metadata question and preserves directory hierarchy.

`find_paths_by_name` answers a flat name-discovery question and returns path matches grouped by root.

### Compared with `find_files_by_glob`

`find_files_by_glob` answers a pattern-selection question using glob semantics.

`find_paths_by_name` answers a plain substring question over entry names.

### Compared with content-search endpoints

Regex and fixed-string search inspect file bodies.

`find_paths_by_name` never inspects file body content. It stops at path discovery.

---

## Local Documentation Ownership Split

The endpoint-local documentation triplet is intentionally split by role:

- [`CONVENTIONS.md`](./CONVENTIONS.md) owns endpoint-local conventions, guardrails, and policy boundaries
- [`DESCRIPTION.md`](./DESCRIPTION.md) owns the detailed endpoint architecture for LLM-agent use
- [`README.md`](./README.md) owns the concise developer-facing summary

Root-level documentation is expected to re-reference this endpoint-local triplet later. This file must therefore stay endpoint-local and must not drift into root-level TOC ownership.
