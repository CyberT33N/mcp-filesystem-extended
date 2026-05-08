# CONVENTIONS — `get_path_metadata` Endpoint

## Purpose of This Document

This document is the endpoint-local single source of truth for the non-obvious conventions, guardrails, and architectural boundaries of `get_path_metadata`.

Shared cross-family rules remain owned by the workspace-level conventions index and the shared guardrail slices, especially [`public-limit-disclosure-governance.md`](../../../../conventions/guardrails/public-limit-disclosure-governance.md). This file does not duplicate those broader rules. It explains how they apply specifically to the structured metadata lookup surface.

---

## What This Endpoint Is

`get_path_metadata` is the structured metadata lookup surface for one or more explicitly requested filesystem paths.

Its contract is:

> Validate the requested file or directory paths against the allowed-directory boundary, resolve structured metadata for each successful lookup, and return per-path errors without discarding the successful results from the same request.

This endpoint is intentionally distinct from adjacent inspection surfaces:

- It does **not** list directory contents like `list_directory_entries`.
- It does **not** discover names or glob matches like `find_paths_by_name` or `find_files_by_glob`.
- It does **not** read file content.
- It does **not** generate or verify integrity hashes.

Instead, it answers one question only:

> What structured metadata belongs to these already known filesystem paths?

---

## Request-Surface Conventions

### Base requests

- Base requests must provide at least one value in `paths`.
- `paths` may contain files or directories.
- `metadata` widens only the optional grouped metadata surfaces. `size` and `type` remain always-on output fields.
- `timestamps` and `permissions` are opt-in grouped metadata selectors.
- The request batch remains bounded by the shared generic path-request ceiling.

### Path-authority boundary

- Every requested path is validated through the allowed-directory guard before metadata is resolved.
- A caller-supplied path does not bypass server-owned path authorization.
- The endpoint must not imply that metadata lookup is exempt from path-guard validation because it is read-only.

---

## Structured Result Conventions

### Result split

The structured result is intentionally split into two arrays:

- `entries` for successful metadata lookups
- `errors` for failed lookups

This split is required because the endpoint supports partial success. One invalid or inaccessible path must not discard successful metadata from sibling paths in the same request.

### Ordering rule

- Successful entries preserve the request order of successful lookups.
- Error entries preserve the request order of failed lookups.
- The endpoint must not sort or regroup results by type, path class, or error class.

### Entry-level invariants

Every successful entry must preserve these local invariants:

- `path` echoes the caller-requested path exactly.
- `size` and `type` are always present.
- grouped timestamps are present only when requested.
- grouped permissions are present only when requested.

The endpoint must not invent synthetic metadata groups beyond the grouped selectors already modeled by the schema.

---

## Text-Formatting Conventions

`get_path_metadata` has an intentional single-versus-batch text split.

### Single-path output

When exactly one path is requested, the text response is a compact key-value metadata block for that path.

### Batch output

When more than one path is requested, the text response becomes a grouped batch report that includes:

- one formatted metadata block per successful entry
- one explicit error block per failed entry

This batch formatting is a caller-visible convenience surface only. The structured `entries` / `errors` contract remains the authoritative metadata surface.

---
---

## Public Limit Disclosure Placement

`get_path_metadata` belongs to the metadata and integrity family and follows the global public-limit-disclosure policy with a request-shape-first emphasis.

### Parameter-description disclosure (required)

Stable request-shape limits belong in the schema-owned parameter descriptions because callers need them while constructing the request.

For `get_path_metadata`, that includes:

- path-length limits via `PATH_MAX_CHARS`
- path-count ceiling via `MAX_GENERIC_PATHS_PER_REQUEST`

The endpoint-local rule is therefore:

> Request-shape limits must be disclosed in [`schema.ts`](./schema.ts) through constant-backed parameter descriptions.

### Tool-description disclosure (selective)

Stable operation-wide delivery rules may appear in the runtime tool description, but this family prioritizes concise request-shape communication over aggressive numeric tool-description disclosure.

For `get_path_metadata`, the important runtime rule is simply that:

- caller-visible metadata output remains bounded by the metadata-family response budget
- oversized multi-path requests may still be refused

### Non-prioritized internal limits (required non-disclosure rationale)

This endpoint must not promote the following internal or broader server-owned limits into its routine public tool description as if they were the primary caller target:

- the exact global fuse as the dominant optimization number
- traversal emergency-runtime ceilings
- internal metadata formatting heuristics

Those surfaces remain owned by shared architecture conventions because they are server-internal protection mechanics rather than the primary caller-actionable contract.

---

## Metadata-Family Guardrail Conventions
`get_path_metadata` belongs to the metadata and integrity family rather than the recursive traversal or preview-first resume families.

The endpoint-specific implications are:

- it uses response-budget enforcement for both single-path and batched formatted text output
- it does **not** expose preview-first resume behavior
- it does **not** expose `resumeToken`
- it does **not** expose traversal admission or continuation metadata

The endpoint may document that text output is bounded by the metadata-family response budget, but it must not restate broader guardrail registries as though they were locally owned here.

---

## Relationship to Sibling Metadata Endpoints

### Compared with `get_file_checksums`

`get_file_checksums` answers an integrity-generation question.

`get_path_metadata` answers a filesystem-fact question about size, type, and optional grouped metadata.

### Compared with `verify_file_checksums`

`verify_file_checksums` compares files against expected hash values.

`get_path_metadata` never performs integrity comparison or expected-value validation.

### Selection rule

Use `get_path_metadata` when the caller already knows the target paths and needs:

- structured path facts
- grouped timestamps or permissions when requested
- partial-success handling across a multi-path batch

Do not use it as a substitute for discovery, content inspection, or checksum workflows.

---

## Local Documentation Ownership Split

The endpoint-local documentation triplet is intentionally split by role:

- `CONVENTIONS.md` owns endpoint-local conventions, guardrails, and policy boundaries
- `DESCRIPTION.md` owns the detailed endpoint architecture for LLM-agent use
- `README.md` owns the concise developer-facing summary

Root-level documentation is expected to re-reference this endpoint-local triplet later. This file must therefore stay endpoint-local and must not drift into root-level TOC ownership.
