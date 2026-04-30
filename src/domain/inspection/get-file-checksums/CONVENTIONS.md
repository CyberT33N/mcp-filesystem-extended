# CONVENTIONS — `get_file_checksums` Endpoint

## Purpose of This Document

This document is the endpoint-local single source of truth for the non-obvious conventions, guardrails, and architectural boundaries of `get_file_checksums`.

Shared cross-family rules remain owned by the workspace-level conventions index and the shared guardrail slices. This file does not duplicate those broader rules. It explains how they apply specifically to the checksum-generation surface.

---

## What This Endpoint Is

`get_file_checksums` is the read-only integrity-generation surface for one or more explicitly requested files.

Its contract is:

> Validate each requested file path against the allowed-directory boundary, compute a deterministic hash with the selected algorithm, and return per-file failures without discarding successful checksum results from the same request.

This endpoint is intentionally distinct from adjacent inspection surfaces:

- It does **not** list directory contents.
- It does **not** discover file paths.
- It does **not** read file body content for caller consumption.
- It does **not** verify hashes against expected values.

Instead, it answers one question only:

> What checksum does each requested file produce under the selected hash algorithm?

---

## Request-Surface Conventions

### Base requests

- Base requests must provide at least one value in `paths`.
- `paths` are file-oriented request targets for checksum generation.
- `algorithm` defaults to `sha256` when the caller does not provide another supported algorithm.
- Supported algorithms are restricted to the schema-owned enum and must not be widened by local documentation.
- The request batch remains bounded by the shared generic path-request ceiling.

### Integrity-generation scope

- This endpoint documents checksum generation only.
- It must not drift into verification semantics owned by `verify_file_checksums`.
- The local docs must not imply that generation and verification are one merged integrity surface.

### Path-authority boundary

- Every requested path is validated through the allowed-directory guard before checksum generation begins.
- A caller-supplied file path does not bypass server-owned path authorization.
- The endpoint must not imply that checksum generation is exempt from path-guard validation because it is read-only.

---

## Structured Result Conventions

### Result split

The structured result is intentionally split into:

- `entries` for successful checksum results
- `errors` for failed file lookups or failed hash generation

This split is required because the endpoint supports partial success. One inaccessible or invalid file must not discard successful hashes from sibling files in the same request.

### Ordering rule

- Successful entries preserve the request order of successful file paths.
- Error entries preserve the request order of failed file paths.
- The endpoint must not sort or regroup results by algorithm, file class, or error class.

### Entry-level invariants

Every successful entry must preserve these local invariants:

- `path` echoes the caller-requested path exactly.
- `hash` contains the computed digest string for the selected algorithm.

The endpoint must not invent auxiliary metadata fields in the checksum result surface.

---

## Text-Formatting Conventions

`get_file_checksums` uses one caller-visible batch-oriented text surface.

### Formatted output rules

- The text output starts with `Checksums (<algorithm>):`.
- Each successful entry is rendered as `<hash><two spaces><path>`.
- Failures are grouped under a dedicated `Errors:` section.

This text formatting is a convenience surface only. The structured `entries` / `errors` contract remains the authoritative result model.

### Metadata-family budget rule

Although this endpoint produces integrity hashes rather than path metadata, its caller-visible text output still remains under the metadata-family response budget.

That means:

- checksum output must stay concise
- oversized formatted checksum output is refused by the shared metadata-family text budget
- this endpoint does **not** expose preview-style continuation or resume metadata to work around text-budget limits

---

## Integrity-Family Boundary Conventions

`get_file_checksums` belongs to the metadata and integrity family, but it owns only checksum generation.

The endpoint-specific implications are:

- it is read-only
- it is file-oriented rather than directory-oriented
- it does not compare computed hashes against expected values
- it does not surface verification summaries or pass/fail integrity judgments

Verification belongs to the separate sibling endpoint `verify_file_checksums` and must stay documented there.

---

## Relationship to Sibling Endpoints

### Compared with `verify_file_checksums`

`verify_file_checksums` answers whether files match expected hashes.

`get_file_checksums` only generates the hashes. It does not evaluate them against an expected value surface.

### Compared with `get_path_metadata`

`get_path_metadata` answers a filesystem-fact question about `size`, `type`, and optional grouped metadata.

`get_file_checksums` answers an integrity-generation question about deterministic file hashes.

### Selection rule

Use `get_file_checksums` when the caller already knows the file paths and needs:

- deterministic checksum generation
- explicit hash-algorithm selection
- partial-success handling across a file batch

Do not use it as a substitute for metadata lookup, discovery, or verification workflows.

---

## Local Documentation Ownership Split

The endpoint-local documentation triplet is intentionally split by role:

- `CONVENTIONS.md` owns endpoint-local conventions, guardrails, and policy boundaries
- `DESCRIPTION.md` owns the detailed endpoint architecture for LLM-agent use
- `README.md` owns the concise developer-facing summary

Root-level documentation is expected to re-reference this endpoint-local triplet later. This file must therefore stay endpoint-local and must not drift into root-level TOC ownership.
