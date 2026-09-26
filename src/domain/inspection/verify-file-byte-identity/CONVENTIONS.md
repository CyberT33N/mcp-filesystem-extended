# CONVENTIONS — `verify_file_byte_identity` Endpoint

## Purpose of This Document

This document is the endpoint-local single source of truth for the non-obvious conventions, guardrails, and architectural boundaries of `verify_file_byte_identity`.

Shared cross-family rules remain owned by the workspace-level conventions index and the shared guardrail slices, especially [`public-limit-disclosure-governance.md`](../../../../conventions/guardrails/public-limit-disclosure-governance.md). This file does not duplicate those broader rules. It explains how they apply specifically to the byte-identity verification surface.

---

## What This Endpoint Is

`verify_file_byte_identity` is the read-only byte-identity verification surface for one reference file and one or more explicitly requested target files.

Its contract is:

> Validate the reference path and every target path against the allowed-directory boundary, compute the reference region hash once with the selected algorithm, compute every target region hash, compare each target hash against the reference hash with normalized lowercase-and-trim equality, preserve per-target failures, and return an aggregate verification summary.

Instead of drifting into adjacent inspection semantics, it answers one question only:

> Are the requested target files byte-identical to the reference file — each inside its bound region?

---

## Region Conventions

### Region modes

Every file side (the reference and each target) binds its own region independently:

- `whole-file` (default) — every byte of the file is hashed.
- `prefix-through-marker` — the byte prefix `[0, end of the marker line]` is hashed, where the marker line ends at the first occurrence of the marker plus its line terminator when one is present.
- `byte-range` — the explicit byte window `[start, endExclusive)` is hashed.

### Marker semantics

- The marker is matched as a **UTF-8 byte sequence**; the first occurrence wins.
- Callers are expected to use sufficiently unique, line-shaped markers.
- The included terminator is `\r\n` (CRLF) or `\n` (LF); when the marker occurrence ends exactly at end of file, no terminator is added.

### Fail-closed rules

- A marker that is absent from a file fails that file — the endpoint never falls back to a wider region silently.
- A byte range that leaves the file (`start` beyond the end, or `endExclusive` greater than the file size) fails that file.
- A reference that cannot be read, or whose marker is absent, fails the **whole request**, because no target verdict could be produced without the reference hash. Target failures stay per-file.

---

## Request-Surface Conventions

### Base requests

- Base requests must provide exactly one `reference` and at least one entry in `targets`.
- Every side carries a `path`; a `region` is optional and defaults to `whole-file`.
- `algorithm` defaults to `sha256` when the caller does not provide another supported algorithm.
- Supported algorithms are restricted to the schema-owned enum and must not be widened by local documentation.
- The target batch remains bounded by the shared generic path-request ceiling.
- Marker strings remain bounded by the shared marker-length ceiling.

### Verification scope

- This endpoint documents reference-based byte-identity verification only.
- It must not drift into expected-hash verification semantics owned by `verify_file_checksums`.
- It must not drift into diff or diagnosis semantics owned by `diff_files`.
- The local docs must not imply that hash generation and identity verification are one merged integrity surface.

### Path-authority boundary

- The reference path and every target path are validated through the allowed-directory guard before any hashing begins.
- A caller-supplied file path does not bypass server-owned path authorization.
- The endpoint must not imply that byte-identity verification is exempt from path-guard validation because it is read-only.

---

## Normalized Comparison Conventions

### Comparison rule

Byte-identity verification is intentionally normalization-aware at the hash-string layer.

- The reference region hash is computed once and reused for every target comparison.
- Each target region hash is normalized with lowercase conversion and surrounding whitespace trimming.
- The reference hash is normalized with the same lowercase-and-trim rule.
- `valid` means the normalized strings are equal.

### What this rule does not mean

- The endpoint does **not** implement fuzzy hash matching.
- The endpoint does **not** reinterpret alternate digest encodings.
- The endpoint does **not** silently switch algorithms to make a comparison pass.

The only local normalization rule is lowercase-plus-trim string equality on hashes already produced under the selected algorithm.

---

## Structured Result Conventions

### Result split

The structured result is intentionally split into:

- `reference` for the reference-side proof surface (path echo plus the computed region hash)
- `entries` for successful comparison attempts
- `errors` for target-level failures that prevented a comparison result
- `summary` for aggregate verification counts

This split is required because the endpoint supports partial success. One unreadable or invalid target must not discard successful verification results from sibling targets in the same request.

### Entry-level invariants

Every successful entry must preserve these local invariants:

- `path` echoes the caller-requested target path exactly.
- `referenceHash` carries the reference region hash used for the comparison.
- `actualHash` contains the checksum computed from the target region under the selected algorithm.
- `valid` records the normalized comparison outcome.

The endpoint must not invent auxiliary metadata fields in the verification result surface.

### Summary invariants

The summary carries three distinct counts:

- `validCount` for successful comparisons whose normalized hashes matched
- `invalidCount` for successful comparisons whose normalized hashes did not match
- `errorCount` for failures where no comparison result could be produced

`invalidCount` is not the same thing as `errorCount`. An invalid comparison still produced a valid checksum computation and therefore belongs in `entries`, not `errors`.

### Ordering rule

- Successful entries preserve request order among targets that reached comparison.
- Error entries preserve request order among targets that failed before comparison.
- The endpoint must not sort or regroup results by validity, algorithm, or error class.

---

## Text-Formatting Conventions

`verify_file_byte_identity` uses one caller-visible batch-oriented text surface.

### Formatted output rules

- The text output starts with `Byte Identity Verification (<algorithm>):`.
- The reference path and the reference region hash are rendered before the summary.
- The summary header renders identical, different, and error counts before any file sections.
- Identical files are grouped under `Identical Files:` and list only the verified paths.
- Different files are grouped under `Different Files:` and include both reference and actual hash lines.
- Failures are grouped under a dedicated `Errors:` section.

This text formatting is a convenience surface only. The structured `reference` / `entries` / `errors` / `summary` contract remains the authoritative result model, and the structured surface mirrors the same data additively.

### Metadata-family budget rule

Although this endpoint performs integrity verification rather than plain metadata lookup, its caller-visible text output still remains under the metadata-family response budget.

That means:

- verification output must stay concise
- oversized formatted verification output is refused by the shared metadata-family text budget
- this endpoint does **not** expose preview-style continuation or resume metadata to work around text-budget limits

---

## Public Limit Disclosure Placement

`verify_file_byte_identity` belongs to the metadata and integrity family and follows the global public-limit-disclosure policy with an integrity-verification emphasis.

### Parameter-description disclosure (required)

Stable request-shape limits belong in the schema-owned parameter descriptions because callers need them while constructing the request.

For `verify_file_byte_identity`, that includes:

- path-length limits via `PATH_MAX_CHARS`
- target-entry count ceiling via `MAX_GENERIC_PATHS_PER_REQUEST`
- marker-string ceiling via `MARKER_MAX_CHARS`
- algorithm selection bounded by the schema-owned enum

The endpoint-local rule is therefore:

> Request-shape limits must be disclosed in [`schema.ts`](./schema.ts) through constant-backed parameter descriptions.

### Tool-description disclosure (selective)

Stable operation-wide delivery rules may appear in the runtime tool description, but this family prioritizes concise request-shape communication over aggressive numeric tool-description disclosure.

For `verify_file_byte_identity`, the important runtime rule is that:

- caller-visible verification output remains bounded by the metadata-family response budget
- oversized multi-target verification requests may still be refused

### Non-prioritized internal limits (required non-disclosure rationale)

This endpoint must not promote the following internal or broader server-owned limits into its routine public tool description as if they were the primary caller target:

- the exact global fuse as the dominant optimization number
- internal normalization or region-extraction implementation mechanics
- server-internal emergency/runtime guardrails

Those surfaces remain owned by shared architecture conventions because they are server-internal protection mechanics rather than the primary caller-actionable contract.

---

## Integrity-Family Boundary Conventions

`verify_file_byte_identity` belongs to the metadata and integrity family, but it owns only reference-based byte-identity verification.

The endpoint-specific implications are:

- it is read-only
- it is file-oriented rather than directory-oriented
- it compares target region hashes against a reference region hash
- it surfaces both per-target verification outcomes and aggregate summary counts
- it preserves partial failures without collapsing the whole request into one undifferentiated failure state

Expected-hash verification belongs to the separate sibling endpoint `verify_file_checksums`, checksum generation belongs to `get_file_checksums`, and diff diagnosis belongs to `diff_files`; each must stay documented at its own surface.

---

## Relationship to Sibling Endpoints

### Compared with `verify_file_checksums`

`verify_file_checksums` answers whether files match caller-supplied expected hashes over the whole file.

`verify_file_byte_identity` answers whether target files are byte-identical to a reference file, optionally restricted to a bound byte region.

### Compared with `get_file_checksums`

`get_file_checksums` answers what checksum each requested file produces.

`verify_file_byte_identity` consumes checksum semantics as an internal step and answers an identity verdict per target.

### Compared with `diff_files`

`diff_files` answers how two text surfaces differ.

`verify_file_byte_identity` answers only the verdict question; mismatches discovered here are diagnosed afterward with `diff_files`, never inside this endpoint.

### Selection rule

Use `verify_file_byte_identity` when the caller already knows:

- the reference file whose bytes define the expectation
- the target files to verify
- the region binding each side should use
- the algorithm that should govern the comparison

and needs:

- pass/fail identity verification per target
- actual hash visibility for mismatches
- aggregate identical/different/error summary counts

Do not use it as a substitute for checksum generation, expected-hash verification, metadata lookup, discovery, or diff diagnosis workflows.

---

## Local Documentation Ownership Split

The endpoint-local documentation triplet is intentionally split by role:

- `CONVENTIONS.md` owns endpoint-local conventions, guardrails, and policy boundaries
- `DESCRIPTION.md` owns the detailed endpoint architecture for LLM-agent use
- `README.md` owns the concise developer-facing summary

Root-level documentation is expected to re-reference this endpoint-local triplet later. This file must therefore stay endpoint-local and must not drift into root-level TOC ownership.
