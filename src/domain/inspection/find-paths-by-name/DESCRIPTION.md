# DESCRIPTION — `find_paths_by_name` Endpoint

## Purpose

`find_paths_by_name` discovers filesystem paths by applying a case-insensitive substring match to file and directory entry names beneath one or more requested roots.

It is the inspection surface for callers that already know the naming signal they care about but do not want directory-shape preservation, glob semantics, or file-body search.

Use this endpoint when the question is:

- which paths beneath these roots have names containing this substring
- how many grouped matches were found per root
- whether result collection truncated before the full traversal finished
- whether the current breadth should continue through the same-endpoint resume contract

Do not use this endpoint when the real need is directory listing, glob-based filtering, or file-content inspection.

---

## Request Model

### Base request surface

The base request is rooted in these fields:

- `roots` — one or more requested traversal roots
- `nameContains` — the case-insensitive substring matched against entry names
- `excludeGlobs` — additive caller exclusions
- `respectGitIgnore` — optional secondary `.gitignore` enrichment
- `includeExcludedGlobs` — additive descendant reopening controls
- `maxResults` — the per-root match ceiling before truncation

The important endpoint-local defaults are:

- `roots` must be present on base requests
- `nameContains` must be present on base requests
- `excludeGlobs` and `includeExcludedGlobs` default to empty lists
- `respectGitIgnore` defaults to `false`
- `maxResults` defaults to the discovery-family hard cap

### Resume-only request surface

Resume-only requests are same-endpoint requests that use:

- `resumeToken`
- `resumeMode`

They do not resend the original root and filter fields. The persisted request context remains server-owned.

---

## Response Model

### Structured surface

The structured response preserves request-order roots:

- `roots[]`
  - `root`
  - `matches[]`
  - `truncated`

The aggregate response also carries:

- `totalMatches`
- aggregate `truncated`
- `admission`
- `resume`

This design keeps root-local attribution intact while still allowing callers to reason over aggregate discovery breadth.

### Text surface

The text surface is caller-visible convenience output.

- inline single-root output becomes newline-joined path matches, `No matches found`, or bounded truncation guidance
- inline multi-root output becomes a grouped batch text block per root
- preview-first responses keep the current bounded match payload in `content.text` and may append resume metadata plus continuation guidance afterward
- `structuredContent.admission` and `structuredContent.resume` remain the authoritative machine-readable envelope whenever they are present
- any mirrored structured payload must not replace `content.text`

This distinction matters because text-only consumers must still receive the current primary result payload, while structured consumers additionally rely on the machine-readable envelope and mirrored structured data.

---

## Name-Matching Semantics

This endpoint performs a plain-text match over entry names only.

### What is matched

- the leaf file name of a file entry
- the directory name of a directory entry

### What is not matched

- file body content
- path components outside the current entry name
- glob wildcards
- regex syntax

The comparison is case-insensitive and substring-based. That makes this endpoint useful for fast name-oriented discovery when callers know part of the target name but do not want to author glob expressions.

---

## Traversal and Admission Flow

`find_paths_by_name` does not enter broad recursive traversal blindly.

Its runtime flow is:

1. validate and normalize the requested roots
2. resolve the shared traversal-scope policy for the request
3. collect bounded candidate-workload evidence for recursive broad-root requests
4. resolve the traversal workload admission decision before the main traversal loop begins
5. traverse in deterministic sorted order while validating visited paths and tracking runtime-budget state
6. assemble the structured resume envelope and caller-visible text surface

This means the endpoint is admission-aware before broad traversal expands. The deeper traversal runtime safeguard remains present as an emergency fuse, but it is not intended to be the first caller-facing control for valid broad workloads.

---

## Traversal-Scope Semantics

The endpoint inherits the shared traversal hardening model and applies it to name discovery.

### Default behavior for broad roots

Broad roots exclude default vendor, cache, and generated directory classes by default.

### Explicit roots remain valid

If the caller explicitly targets a root inside one of those excluded trees, that root is still valid. The hardening model distinguishes between broad-root traversal and deliberate path targeting.

### Additive descendant reopening

`includeExcludedGlobs` reopens explicitly named descendants beneath excluded trees without broadening the full request scope.

### Optional `.gitignore` participation

`respectGitIgnore` adds optional root-local ignore rules on top of the server-owned baseline. It does not replace that baseline.

---

## Resume Behavior

`find_paths_by_name` belongs to the preview-capable resume families.

### Supported resume intents

- `resumeMode = 'next-chunk'` — returns the next bounded preview chunk
- `resumeMode = 'complete-result'` — continues the same server-owned session toward a complete result

### Additive completion contract

`complete-result` is additive.

The completion payload continues from the persisted traversal frontier. It is not a replay of the previously delivered preview chunk. The caller must combine both payloads when reconstructing the full result.

### Text-budget interaction

For this endpoint, inline and `next-chunk` delivery remain under the discovery-family response cap. `complete-result` uses the global response fuse as the final ceiling instead of the discovery-family cap. That is a shared resume/guardrail rule and must stay aligned with the shared convention leaves.

---

## Ordering and Stability Invariants

This endpoint preserves several invariants that matter for autonomous agents:

- requested roots stay in caller order
- directory reads are lexicographically sorted before entry processing
- matching is deterministic for the same filesystem state
- truncation is explicit rather than implicit
- resume progression is frontier-based rather than replay-based

These invariants make repeated discovery safer to compare and easier to continue across bounded preview sessions.

---

## Relationship to Other Inspection Surfaces

### Versus `list_directory_entries`

`list_directory_entries` preserves directory structure and grouped metadata.

`find_paths_by_name` returns flat path matches grouped by root and focuses on name discovery.

### Versus `find_files_by_glob`

`find_files_by_glob` is pattern-driven and glob-oriented.

`find_paths_by_name` is plain-substring-driven and does not expose glob semantics.

### Versus regex and fixed-string search

Regex and fixed-string search inspect file bodies.

`find_paths_by_name` never inspects file body content. It is a discovery surface only.

---

## Why This Endpoint Needs Local Documentation

The root documentation set owns the project-wide TOC and shared guardrail references.

This endpoint-local description exists because `find_paths_by_name` has endpoint-specific behavior that cannot be explained precisely enough by root-level TOC text alone:

- case-insensitive substring semantics over entry names
- flat per-root path result grouping
- helper-owned traversal and truncation behavior
- preview-first plus additive `complete-result` semantics on the same endpoint
- name-discovery-specific interpretation of the shared traversal hardening model

That endpoint-local detail belongs here, while broader cross-family guardrail ownership remains shared.
