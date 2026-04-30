# DESCRIPTION — `find_files_by_glob` Endpoint

## Purpose

`find_files_by_glob` discovers filesystem paths by applying a caller-supplied glob to relative traversal paths beneath one or more requested roots.

It is the inspection surface for callers that already know the path-pattern shape they care about but do not want directory-shape preservation, plain substring matching, or file-body search.

Use this endpoint when the question is:

- which paths beneath these roots match this glob
- how many grouped matches were found per root
- whether result collection truncated before traversal completed
- whether the breadth should continue through the same-endpoint resume contract

Do not use this endpoint when the real need is directory listing, name-substring discovery, or file-content inspection.

---

## Request Model

### Base request surface

The base request is rooted in these fields:

- `roots` — one or more requested traversal roots
- `glob` — the path-oriented glob evaluated beneath each root
- `excludeGlobs` — additive caller exclusions
- `respectGitIgnore` — optional secondary `.gitignore` enrichment
- `includeExcludedGlobs` — additive descendant reopening controls
- `maxResults` — the per-root match ceiling before truncation

The important endpoint-local defaults are:

- `roots` must be present on base requests
- `glob` must be present on base requests
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

- inline single-root output becomes a concise matched-path report for that root
- inline multi-root output becomes a grouped batch text block per root
- preview-first responses may collapse to bounded progress/guidance text with resume metadata
- structured resume/admission surfaces remain authoritative whenever they are present

This distinction matters because text-only consumers may use the preview text, while structured consumers must rely on the authoritative `structuredContent` envelope.

---

## Glob-Matching Semantics

This endpoint performs a path-oriented glob match.

### What is matched

- relative traversal paths beneath each requested root
- caller-supplied glob expressions with dot-aware matching

### What is not matched

- file body content
- plain substring semantics
- regex syntax
- preserved directory-shape output

The endpoint is discovery-oriented and returns grouped flat matches rather than snippets, structured tree entries, or file content.

---

## Traversal and Admission Flow

`find_files_by_glob` does not enter broad recursive traversal blindly.

Its runtime flow is:

1. validate and normalize the requested roots
2. resolve the shared traversal-scope policy for the request
3. collect bounded candidate-workload evidence for recursive broad-root requests
4. resolve the traversal workload admission decision before the main traversal loop begins
5. traverse in deterministic sorted order while evaluating the glob against relative paths, validating visited paths, and tracking runtime-budget state
6. assemble the structured resume envelope and caller-visible text surface

This means the endpoint is admission-aware before broad traversal expands. The deeper traversal runtime safeguard remains present as an emergency fuse, but it is not intended to be the first caller-facing control for valid broad workloads.

---

## Traversal-Scope Semantics

The endpoint inherits the shared traversal hardening model and applies it to glob discovery.

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

`find_files_by_glob` belongs to the preview-capable resume families.

### Supported resume intents

- `resumeMode = 'next-chunk'` — returns the next bounded preview chunk
- `resumeMode = 'complete-result'` — continues the same server-owned session toward a complete result

### Additive completion contract

`complete-result` is additive.

The completion payload continues from the persisted traversal frontier. It is not a replay of the previously delivered preview chunk. The caller must combine both payloads when reconstructing the complete dataset.

### Text-budget interaction

For this endpoint, inline and `next-chunk` delivery remain under the discovery-family response cap. `complete-result` uses the global response fuse as the final ceiling instead of the discovery-family cap. That is a shared resume/guardrail rule and must stay aligned with the shared convention leaves.

---

## Ordering and Stability Invariants

This endpoint preserves several invariants that matter for autonomous agents:

- requested roots stay in caller order
- directory reads are lexicographically sorted before entry processing
- returned matches are sorted before output
- truncation is explicit rather than implicit
- resume progression is frontier-based rather than replay-based

These invariants make repeated discovery safer to compare and easier to continue across bounded preview sessions.

---

## Relationship to Other Inspection Surfaces

### Versus `find_paths_by_name`

`find_paths_by_name` is plain-substring-driven and name-oriented.

`find_files_by_glob` is pattern-driven and glob-oriented.

### Versus `list_directory_entries`

`list_directory_entries` preserves structure and grouped metadata.

`find_files_by_glob` returns flat matches grouped by root.

### Versus regex and fixed-string search

Regex and fixed-string search inspect file bodies.

`find_files_by_glob` never inspects file body content. It is a discovery surface only.

---

## Why This Endpoint Needs Local Documentation

The root documentation set owns the project-wide TOC and shared guardrail references.

This endpoint-local description exists because `find_files_by_glob` has endpoint-specific behavior that cannot be explained precisely enough by root-level TOC text alone:

- path-oriented glob semantics
- flat per-root path result grouping
- handler-owned traversal and truncation behavior
- preview-first plus additive `complete-result` semantics on the same endpoint
- glob-discovery-specific interpretation of the shared traversal hardening model

That endpoint-local detail belongs here, while broader cross-family guardrail ownership remains shared.
