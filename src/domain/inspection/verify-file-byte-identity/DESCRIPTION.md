# DESCRIPTION — `verify_file_byte_identity` Endpoint

## Purpose

`verify_file_byte_identity` proves server-side, in batch form, whether one or more target files are byte-identical to a reference file — over the whole file or inside an explicitly bound byte region.

It is the inspection surface for callers that already have a reference file whose bytes define the expectation and need a deterministic identity verdict per target, including governed-region proofs that end at a marker line.

Use this endpoint when the question is:

- whether each requested target is byte-identical to the reference inside its bound region
- which targets are identical versus different under the selected algorithm
- which targets failed before a comparison result could be produced
- how the aggregate verification summary breaks down across identical, different, and error outcomes

Do not use this endpoint when the real need is checksum generation, expected-hash verification without a reference file, metadata lookup, file-content reading, or diff diagnosis.

---

## Request Model

### Base request surface

The base request is rooted in these fields:

- `reference` — the reference file whose bytes define the expectation (`path` plus optional `region`)
- `targets` — one or more target files (`path` plus optional `region` each)
- `algorithm` — the selected hash algorithm

The important endpoint-local defaults are:

- `reference` must be present on base requests
- `targets` must contain at least one entry
- every side binds its own `region`; an omitted region means `whole-file`
- `algorithm` defaults to `sha256`
- algorithm selection is limited to the schema-owned enum

The public request contract exposes stable caller-actionable request limits directly on the parameter surface:

- reference and target paths remain bounded by the shared path-length cap
- the target batch remains bounded by the shared generic path-count ceiling
- marker strings remain bounded by the shared marker-length ceiling
- algorithm choice remains bounded to the schema-owned enum

### Region semantics

Every file side binds one of exactly three region modes:

- `whole-file` — every byte is hashed
- `prefix-through-marker` — the byte prefix ending at the end of the first marker occurrence is hashed, including the marker line terminator (`\r\n` or `\n`) when present
- `byte-range` — the explicit byte window `[start, endExclusive)` is hashed

The marker is matched as a UTF-8 byte sequence; the first occurrence wins. Region binding is fail-closed:

- an absent marker fails the affected file instead of silently widening the region
- an out-of-file byte range fails the affected file
- a reference that cannot be read or whose marker is absent fails the whole request, because no target verdict could be produced without it

---

## Response Model

### Structured surface

The structured response is intentionally modeled as partial-success output:

- `reference` contains the reference-side proof surface (`path`, `regionHash`)
- `entries[]` contains successful comparison attempts
- `errors[]` contains per-target failures
- `summary` contains aggregate counts

Each successful entry contains:

- `path`
- `referenceHash`
- `actualHash`
- `valid`

Each error entry contains:

- `path`
- `error`

The summary contains:

- `validCount`
- `invalidCount`
- `errorCount`

This contract allows one request to preserve identical targets, different targets, and failed targets together without collapsing the batch into one coarse result.

### Text surface

The text surface is caller-visible convenience output.

- the output begins with the selected algorithm label
- the reference path and reference region hash render before the summary
- the summary header exposes identical, different, and error totals first
- identical files are grouped separately from different files
- different files include both reference and actual hash values
- failed targets are grouped under `Errors:`

The structured `reference` / `entries` / `errors` / `summary` surface remains the authoritative machine-facing result model and mirrors the same data additively.

---

## Validation and Execution Flow

`verify_file_byte_identity` follows a strict validation and comparison flow before a verification result is emitted.

Its runtime flow is:

1. accept the caller-requested `reference` and `targets`
2. validate the reference path against the allowed-directory boundary
3. compute the reference region hash once using the selected algorithm and region binding
4. validate each target path against the allowed-directory boundary
5. compute each target region hash under the same algorithm
6. normalize both hash strings with lowercase-plus-trim semantics and classify the comparison as valid or invalid
7. capture pre-comparison target failures as per-target `errors`
8. assemble the structured `reference`, `entries`, `errors`, and `summary` response
9. format the caller-visible verification text output
10. enforce the metadata-family text-response budget

This means the endpoint is not a raw compare helper. It remains a server-owned inspection surface with explicit path authorization, deterministic normalization, structured batch results, and bounded caller-visible output behavior.

---

## Normalized Comparison Semantics

One of the most important local behaviors of this endpoint is normalized string comparison at the hash-string layer.

### What is normalized

- the computed `actualHash`
- the reused `referenceHash`

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

- **identical entries** — region hashing succeeded and the normalized hashes matched
- **different entries** — region hashing succeeded but the normalized hashes did not match
- **error entries** — the endpoint could not produce a comparison result for that target

### Why this matters

Consumers must not treat `invalid` and `error` as the same state.

- a different entry still proves that the target was readable and hashable
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

## Public Limit Disclosure Model

For this endpoint, limit disclosure is intentionally split across two public surfaces.

### Parameter surface

Parameter descriptions carry the stable request-shape limits that callers need while constructing the request:

- path-length limits
- maximum target-entry count
- marker-string length ceiling
- bounded algorithm selection through the schema enum

### Tool-description surface

The runtime tool description carries the stable operation-wide delivery rule:

- caller-visible verification output remains bounded by the metadata-family response budget
- oversized multi-target verification requests may be refused rather than treated as a continuation-driven discovery surface

### Intentional non-disclosure in routine tool text

The routine tool description does not prioritize:

- the exact global fuse as the primary planning number
- internal normalization or region-extraction implementation mechanics
- server-internal emergency/runtime guardrails

Those surfaces remain owned by shared architecture conventions because they are server-internal protection mechanics rather than the primary caller-actionable contract.

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

- requested target paths are echoed exactly in the entry or error object that represents them
- the reference path and the reference region hash are echoed exactly
- successful verification entries preserve request order among targets that reached comparison
- failed verification errors preserve request order among targets that failed before comparison
- the selected hash algorithm is applied consistently across the whole request batch
- the formatted text output is deterministic for the same structured result

These invariants make repeated identity checks easier to compare and safer to use in follow-up workflows.

---

## Relationship to Other Inspection Surfaces

### Versus `verify_file_checksums`

`verify_file_checksums` compares whole files against caller-supplied expected hashes.

`verify_file_byte_identity` compares target files against a reference file, with an optional region binding per side.

### Versus `get_file_checksums`

`get_file_checksums` only generates checksums.

`verify_file_byte_identity` uses those checksum semantics as an internal step, then compares each target region hash to the reference region hash and surfaces identity verdicts.

### Versus `diff_files`

`diff_files` produces a diagnostic unified diff.

`verify_file_byte_identity` produces only the verdict; mismatch diagnosis is delegated to `diff_files` afterward.

### Versus discovery and read surfaces

Discovery endpoints help find paths.

Read endpoints surface file content.

`verify_file_byte_identity` assumes the caller already knows the reference and target paths and now wants identity verification against the reference bytes.

---

## Why This Endpoint Needs Local Documentation

The root documentation set owns the project-wide TOC and shared architecture references.

This endpoint-local description exists because `verify_file_byte_identity` has endpoint-specific behavior that cannot be explained precisely enough by root-level TOC text alone:

- reference-file-based identity verification rather than expected-hash verification
- the three-mode region model with fail-closed marker and byte-range semantics
- `reference` / `entries` / `errors` / `summary` output with identical-versus-different distinction
- validated path scope before region hashing and comparison
- metadata-family text-budget behavior without preview-style resume semantics

That endpoint-local detail belongs here, while broader cross-family ownership remains shared.
