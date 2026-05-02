# CONVENTIONS — `list_directory_entries` Endpoint

## Purpose of This Document

This document is the endpoint-local single source of truth for the non-obvious conventions, guardrails, and architectural boundaries of `list_directory_entries`.

Shared cross-family rules remain owned by the workspace-level conventions index and the shared guardrail and resume architecture documents. This file does not duplicate those broader rules. It explains how they apply specifically to the structured directory-listing surface.

---

## What This Endpoint Is

`list_directory_entries` is the structured directory-listing surface for one or more requested roots.

Its contract is:

> Return requested roots in caller order, with structured directory entries rooted beneath each requested path.

This endpoint is intentionally distinct from the other discovery surfaces:

- It does **not** perform name-substring discovery like `find_paths_by_name`.
- It does **not** perform glob-based discovery like `find_files_by_glob`.
- It does **not** read file content.
- It does **not** search inside file bodies.

Instead, it preserves directory shape and exposes grouped metadata with optional recursion.

---

## Request-Surface Conventions

### Base requests

- Base requests must provide at least one value in `roots`.
- `recursive` defaults to `false`.
- `metadata` widens only the optional grouped metadata surfaces. `size` and `type` are always present.
- `excludeGlobs` is additive and narrows the traversal scope.
- `includeExcludedGlobs` reopens explicitly named descendants without widening the full traversal baseline.
- `respectGitIgnore` is optional and secondary. It layers repository-local ignore behavior on top of the server-owned traversal policy rather than replacing it.

### Resume-only requests

- Resume-only requests must use the same endpoint.
- Resume-only requests must send only `resumeToken` plus the chosen `resumeMode`.
- Query-defining fields from the base request are not resent on resume-only requests.

---

## Structured Response Conventions

### Root-level structure

The structured response preserves one root object per requested path:

- `requestedPath` echoes the root exactly as requested.
- `entries` contains the structured listing rooted beneath that path.

The order of `roots` must stay aligned to the original request order.

### Entry-level structure

Each returned entry is a structured filesystem record with these local invariants:

- `name` is the leaf entry name.
- `path` is relative to the requested root.
- `path` is slash-normalized.
- `type` and `size` are always present.
- grouped timestamp metadata is optional
- grouped permission metadata is optional
- `children` exists only when recursive traversal includes descendants for that entry

The endpoint must preserve structure. It must not flatten a recursive listing into a path-only match list.

### Stable traversal ordering

Entries are produced from lexicographically sorted directory reads. This keeps the listing stable and deterministic across repeated runs against the same filesystem state.

---

## Traversal-Scope Conventions

`list_directory_entries` inherits the shared traversal-scope policy and applies it as a directory-listing surface.

The endpoint-specific implications are:

- Broad roots exclude default vendor, cache, and generated trees by default.
- Explicit roots inside excluded trees remain valid.
- Additive descendant reopening stays narrow and must use `includeExcludedGlobs`.
- Optional `.gitignore` participation remains secondary.
- Narrowing the root or setting `recursive = false` is the first-class way to reduce workload.

This endpoint must not imply that callers can bypass the server-owned default traversal hardening by default. The additive controls narrow or reopen named descendants only within the already-defined shared policy.

---

## Admission and Resume Conventions

`list_directory_entries` is a preview-capable inspection family member.

Its caller-visible conventions are:

- broad valid listing workloads may degrade into preview-first delivery
- the same endpoint supports `resumeMode = 'next-chunk'`
- the same endpoint supports `resumeMode = 'complete-result'`
- no second continuation endpoint exists
- scope reduction remains a first-class alternative to resume

### Authority split between structured and text surfaces

When additive `admission` and `resume` metadata are present:

- `structuredContent.admission` is the authoritative machine-readable admission envelope
- `structuredContent.resume` is the authoritative machine-readable resume envelope
- the current bounded directory-entry payload remains complete in `content.text`
- any mirrored structured result data must not replace `content.text`

For preview-first directory-listing responses, `content.text` may also append the active `resumeToken` and continuation guidance after the current bounded directory-entry payload so text-only consumers still have a workable continuation path.

### Additive `complete-result` rule

`complete-result` continuation is additive, not redundant.

The server continues from the persisted frontier rather than replaying the entire already-delivered preview chunk. Callers must combine the earlier preview payload with the later completion payload to reconstruct the complete dataset.

---

## Guardrail Ownership Conventions

This endpoint owns how the shared guardrails are expressed locally, but it does not own the cross-family guardrails themselves.

That means:

- the endpoint may document how shared traversal admission affects directory listing
- the endpoint may document how grouped metadata and recursion behave locally
- the endpoint must not restate the workspace-level guardrail registry as if it were local policy ownership
- the endpoint must not redefine shared resume semantics, family-cap behavior, or the global fuse locally

When shared guardrail behavior matters here, this file re-references that behavior and narrows it to the local `list_directory_entries` meaning.

---

## Relationship to Sibling Discovery Endpoints

### Compared with `find_paths_by_name`

`find_paths_by_name` answers a name-matching question and returns flat path matches.

`list_directory_entries` answers a structure-and-metadata question and returns requested roots plus structured entries.

### Compared with `find_files_by_glob`

`find_files_by_glob` answers a glob-selection question and returns flat file matches.

`list_directory_entries` answers a listing question and preserves directory hierarchy when recursion is enabled.

### Selection rule

Use `list_directory_entries` when the caller needs:

- a structured view of entries beneath one or more roots
- optional nested children
- grouped metadata on returned entries

Do not use it as a substitute for path discovery, content search, or full file reading.

---

## Local Documentation Ownership Split

The endpoint-local documentation triplet is intentionally split by role:

- `CONVENTIONS.md` owns endpoint-local conventions, guardrails, and policy boundaries
- `DESCRIPTION.md` owns the detailed endpoint architecture description for LLM-agent use
- `README.md` owns the concise developer-facing summary

Root-level documentation is expected to re-reference this endpoint-local triplet later. This file must therefore stay endpoint-local and must not drift into root-level TOC ownership.
