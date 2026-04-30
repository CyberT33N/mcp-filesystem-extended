# DESCRIPTION — `verify_file_checksums` Endpoint

## Purpose

`verify_file_checksums` computes structured checksum-verification results for one or more explicitly requested files.

It is the inspection surface for callers that already know which files they want to validate and already have the expected checksum values they want to compare against.

Use this endpoint when the question is:

- whether each requested file matches its expected hash
- which files are valid versus invalid under the selected algorithm
- which requests failed before a comparison result could be produced
- how the aggregate verification summary breaks down across valid, invalid, and error outcomes

Do not use this endpoint when the real need is directory listing, metadata lookup, file-content reading, or checksum generation without expected-hash comparison.

---

## Request Model

### Base request surface

The base request is rooted in these fields:

- `files` — one or more requested file and expected-hash pairs
- `algorithm` — the selected hash algorithm

The important endpoint-local defaults are:

- `files` must be present on base requests
- every `files` item must contain both `path` and `expectedHash`
- `algorithm` defaults to `sha256`
- algorithm selection is limited to the schema-owned enum

### Algorithm and expected-hash semantics

The schema controls which checksum algorithms are allowed.

That means:

- the endpoint does not accept arbitrary digest names
- the caller-visible algorithm value is deterministic and explicit
- the expected hash is compared only against a checksum generated under that selected algorithm
- the local docs must describe the default and supported set without inventing additional algorithms

---

## Response Model

### Structured surface

The structured response is intentionally modeled as partial-success output:

- `entries[]` contains successful verification attempts
- `errors[]` contains per-file failures
- `summary` contains aggregate counts

Each successful entry contains:

- `path`
- `expectedHash`
- `actualHash`
- `valid`

Each error entry contains:

- `path`
- `expectedHash`
- `error`

The summary contains:

- `validCount`
- `invalidCount`
- `errorCount`

This contract allows one request to preserve matching files, mismatching files, and failed files together without collapsing the batch into one coarse result.

### Text surface

The text surface is caller-visible convenience output.

- the output begins with the selected algorithm label
- the summary header exposes valid, invalid, and error totals first
- valid files are grouped separately from invalid files
- invalid files include both expected and actual hash values
- failed files are grouped under `Errors:`

The structured `entries` / `errors` / `summary` surface remains the authoritative machine-facing result model.

---

## Validation and Execution Flow

`verify_file_checksums` follows a strict validation and comparison flow before a verification result is emitted.

Its runtime flow is:

1. accept the caller-requested `files`
2. validate each `path` against the allowed-directory boundary
3. compute the actual file hash using the selected algorithm
4. normalize both the actual hash and `expectedHash` with lowercase-plus-trim semantics
5. classify the comparison as valid or invalid when checksum generation succeeded
6. capture pre-comparison failures as per-file `errors`
7. assemble the structured `entries`, `errors`, and `summary` response
8. format the caller-visible verification text output
9. enforce the metadata-family text-response budget

This means the endpoint is not a raw compare helper. It remains a server-owned inspection surface with explicit path authorization, deterministic normalization, structured batch results, and bounded caller-visible output behavior.

---

## Normalized Comparison Semantics

One of the most important local behaviors of this endpoint is normalized string comparison.

### What is normalized

- the computed `actualHash`
- the caller-supplied `expectedHash`

### How the normalization works

- convert to lowercase
- trim surrounding whitespace
- compare the normalized strings for equality

### What this does not imply

- it does not reinterpret different algorithms as equivalent
- it does not canonicalize malformed hash strings into valid digests
- it does not perform fuzzy or prefix-based matching

The endpoint therefore remains strict about algorithm choice while still preventing trivial case or whitespace drift from creating false mismatches.

---

## Partial-Success Semantics

This endpoint distinguishes between three outcome classes inside the same request:

- **valid entries** — checksum generation succeeded and the normalized hashes matched
- **invalid entries** — checksum generation succeeded but the normalized hashes did not match
- **error entries** — the endpoint could not produce a comparison result for that file

### Why this matters

Consumers must not treat `invalid` and `error` as the same state.

- an invalid entry still proves that the file was readable and hashable
- an error entry means the endpoint failed before a verification judgment could be produced

This is especially important for autonomous agents that may otherwise mistake a non-empty `entries` array for universal success or mistake `errorCount` for the total number of mismatches.

---

## Summary Semantics

The `summary` object is not a decorative surface. It is the endpoint-local aggregate contract that lets consumers inspect batch verification health at a glance.

- `validCount` counts successful comparisons that matched
- `invalidCount` counts successful comparisons that mismatched
- `errorCount` counts failed verification attempts

The summary therefore complements, but never replaces, the detailed `entries` and `errors` arrays.

---

## Output-Budget Semantics

This endpoint remains part of the metadata and integrity family for caller-visible response budgeting.

That means:

- verification text output must remain concise
- the caller-visible text surface is bounded by the metadata-family response cap
- the endpoint does not expose preview-style resume behavior as a workaround for oversized output

This is a bounded batch-inspection surface, not a continuation-driven discovery family.

---

## Ordering and Stability Invariants

This endpoint preserves several invariants that matter for autonomous agents and deterministic workflows:

- requested file paths are echoed exactly in the entry or error object that represents them
- `expectedHash` is echoed exactly for both successful and failed verification attempts
- successful verification entries preserve request order among files that reached comparison
- failed verification errors preserve request order among files that failed before comparison
- the selected hash algorithm is applied consistently across the whole request batch
- the formatted text output is deterministic for the same structured result

These invariants make repeated integrity checks easier to compare and safer to use in follow-up workflows.

---

## Relationship to Other Inspection Surfaces

### Versus `get_file_checksums`

`get_file_checksums` only generates checksums.

`verify_file_checksums` uses those checksum semantics as an internal step, then compares the actual hash to a caller-supplied expected value and surfaces verification outcomes.

### Versus `get_path_metadata`

`get_path_metadata` answers a filesystem-fact question about `size`, `type`, and optional grouped metadata.

`verify_file_checksums` answers a read-only integrity-validation question about expected-versus-actual checksum equality.

### Versus discovery and read surfaces

Discovery endpoints help find paths.

Read endpoints surface file content.

`verify_file_checksums` assumes the caller already knows the file paths and now wants integrity validation against known expected hashes.

---

## Why This Endpoint Needs Local Documentation

The root documentation set owns the project-wide TOC and shared architecture references.

This endpoint-local description exists because `verify_file_checksums` has endpoint-specific behavior that cannot be explained precisely enough by root-level TOC text alone:

- expected-hash verification rather than checksum generation
- normalization-aware lowercase-and-trim comparison semantics
- `entries` / `errors` / `summary` output with valid-versus-invalid distinction
- validated path scope before hash generation and comparison
- metadata-family text-budget behavior without preview-style resume semantics

That endpoint-local detail belongs here, while broader cross-family ownership remains shared.
