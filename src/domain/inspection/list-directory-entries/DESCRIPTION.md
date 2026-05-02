# DESCRIPTION — `list_directory_entries` Endpoint

## Purpose

`list_directory_entries` lists one or more directory roots and returns structured directory entries for each requested root.

It is the inspection surface for callers that need directory shape, relative entry paths, grouped metadata, and optional recursion.

Use this endpoint when the question is:

- what entries exist beneath these roots
- what their relative paths are
- what grouped metadata belongs to those entries
- whether nested directory structure should be preserved in the response

Do not use this endpoint when the real need is flat path discovery, file-content reading, or content search.

---

## Request Model

### Base request surface

The base request is rooted in these fields:

- `roots` — one or more requested directory roots
- `recursive` — whether nested directories are traversed
- `metadata` — optional grouped metadata selectors
- `excludeGlobs` — additive caller exclusions
- `respectGitIgnore` — optional secondary `.gitignore` enrichment
- `includeExcludedGlobs` — additive descendant reopening controls

The important endpoint-local defaults are:

- `roots` must be present on base requests
- `recursive` defaults to `false`
- `size` and `type` are always returned
- timestamps and permissions are opt-in grouped metadata

### Resume-only request surface

Resume-only requests are same-endpoint requests that use:

- `resumeToken`
- `resumeMode`

They do not resend the original query-defining root and scope fields. The persisted request context remains server-owned.

---

## Response Model

### Structured surface

The structured response preserves request-order roots:

- `roots[]`
  - `requestedPath`
  - `entries[]`

Each listed entry contains:

- `name`
- `path`
- `type`
- `size`
- optional grouped timestamp metadata
- optional grouped permission metadata
- optional `children[]` when recursive traversal includes descendants

The `path` field is relative to the requested root and is slash-normalized.

### Text surface

The text surface is caller-visible convenience output.

- inline responses may encode the full structured result
- preview-first responses keep the current bounded directory-entry payload in `content.text`
- preview-first text may also append the active `resumeToken` and continuation guidance after that payload
- `structuredContent.admission` and `structuredContent.resume` remain the authoritative machine-readable envelope
- any mirrored structured payload must not replace `content.text`

This distinction matters because text-only consumers must still receive the current primary result payload, while structured consumers additionally gain the machine-readable envelope and mirrored structured data.

---

## Traversal and Admission Flow

`list_directory_entries` does not enter broad recursive traversal blindly.

Its runtime flow is:

1. validate and resolve the requested root paths
2. resolve the shared traversal-scope policy for the request
3. collect bounded candidate-workload evidence for recursive broad-root requests
4. resolve the traversal workload admission decision before the main traversal loop begins
5. execute the selected listing lane
6. assemble the structured resume envelope and caller-visible text surface

This means the endpoint is admission-aware before broad traversal expands. The deeper runtime traversal budget stays in place as an emergency safeguard, but it is not the intended first caller-facing control for valid broad workloads.

---

## Traversal-Scope Semantics

The endpoint inherits the shared traversal-scope hardening model and applies it to directory listing.

### Default behavior for broad roots

Broad roots exclude default vendor, cache, and generated directory classes by default.

### Explicit roots remain valid

If the caller explicitly targets a root inside one of those excluded trees, that root is still valid. The hardening model distinguishes between broad-root traversal and deliberate path targeting.

### Additive descendant reopening

`includeExcludedGlobs` reopens explicitly named descendants beneath excluded trees without broadening the full root scope.

### Optional `.gitignore` participation

`respectGitIgnore` adds optional root-local ignore rules on top of the server-owned baseline. It does not replace that baseline.

---

## Resume Behavior

`list_directory_entries` belongs to the preview-capable resume families.

### Supported resume intents

- `resumeMode = 'next-chunk'` — returns the next bounded inspection chunk
- `resumeMode = 'complete-result'` — continues the same server-owned session toward a complete result

### Additive completion contract

`complete-result` is additive.

The completion payload continues from the persisted frontier position. It is not a replay of the previously delivered preview chunk. The caller must combine both payloads when reconstructing the full result.

### Finalization edge case

A preview-first session may finalize without an active resume token only when the currently bounded payload already represents the final remaining data and no further continuation step exists.

---

## Ordering and Stability Invariants

This endpoint preserves several stability guarantees that matter for autonomous agents:

- requested roots stay in caller order
- directory entries are read in deterministic lexicographic order
- relative paths are normalized to slash-separated form
- nested children appear only when recursion is enabled
- grouped metadata is widened only through explicit metadata selection

These invariants make repeated listings easier to compare and safer to consume in follow-up LLM workflows.

---

## Relationship to Other Inspection Surfaces

### Versus `find_paths_by_name`

`find_paths_by_name` returns flat path matches based on a case-insensitive name substring.

`list_directory_entries` returns structured directory entries rooted beneath explicit directories. It is not a flat discovery result surface.

### Versus `find_files_by_glob`

`find_files_by_glob` returns files selected by glob matching.

`list_directory_entries` returns directory entries, may include directories, and preserves nested structure when recursion is enabled.

### Versus read and search surfaces

This endpoint describes the filesystem shape. It does not inspect file body content. Reading and searching remain separate responsibilities.

---

## Why This Endpoint Needs Local Documentation

The root documentation set owns project-wide TOC and shared guardrail references.

This endpoint-local description exists because `list_directory_entries` has endpoint-specific behavior that cannot be explained precisely enough by root-level TOC text alone:

- structured roots and entries
- grouped metadata behavior
- preview-first text surfacing of bounded directory-entry payloads
- additive completion semantics for the same endpoint
- directory-listing-specific interpretation of the shared traversal hardening model

That endpoint-local detail belongs here, while broader cross-family guardrail ownership remains shared.
