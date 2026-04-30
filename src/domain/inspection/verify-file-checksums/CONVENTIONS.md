# CONVENTIONS — `verify_file_checksums` Endpoint

## Purpose of This Document

This document is the endpoint-local single source of truth for the non-obvious conventions, guardrails, and architectural boundaries of `verify_file_checksums`.

Shared cross-family rules remain owned by the workspace-level conventions index and the shared guardrail slices. This file does not duplicate those broader rules. It explains how they apply specifically to the checksum-verification surface.

---

## What This Endpoint Is

`verify_file_checksums` is the read-only integrity-verification surface for one or more explicitly requested file and expected-hash pairs.

Its contract is:

> Validate each requested file path against the allowed-directory boundary, compute the actual hash with the selected algorithm, normalize both the actual and expected hashes for comparison, preserve per-file failures, and return an aggregate verification summary.

This endpoint is intentionally distinct from adjacent inspection surfaces:

- It does **not** list directory contents.
- It does **not** discover file paths.
- It does **not** read file body content for caller consumption.
- It does **not** generate checksums as its final business question.

Instead, it answers one question only:

> Do the requested files match the caller-supplied expected hashes under the selected algorithm?

---

## Request-Surface Conventions

### Base requests

- Base requests must provide at least one object in `files`.
- Every `files` item must carry both `path` and `expectedHash`.
- `algorithm` defaults to `sha256` when the caller does not provide another supported algorithm.
- Supported algorithms are restricted to the schema-owned enum and must not be widened by local documentation.
- The request batch remains bounded by the shared generic path-request ceiling.

### Verification scope

- This endpoint documents checksum verification only.
- It must not drift into checksum-generation-only semantics owned by `get_file_checksums`.
- The local docs must not imply that generation and verification are one merged integrity surface.

### Path-authority boundary

- Every requested path is validated through the allowed-directory guard before checksum verification begins.
- A caller-supplied file path does not bypass server-owned path authorization.
- The endpoint must not imply that checksum verification is exempt from path-guard validation because it is read-only.

---

## Normalized Comparison Conventions

### Comparison rule

Checksum verification is intentionally normalization-aware.

- The computed hash is normalized with lowercase conversion and surrounding whitespace trimming.
- The caller-supplied `expectedHash` is normalized with the same lowercase-and-trim rule.
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

- `entries` for successful verification attempts
- `errors` for file-level failures that prevented a comparison result
- `summary` for aggregate verification counts

This split is required because the endpoint supports partial success. One unreadable or invalid file must not discard successful verification results from sibling files in the same request.

### Entry-level invariants

Every successful entry must preserve these local invariants:

- `path` echoes the caller-requested path exactly.
- `expectedHash` echoes the caller-supplied expected hash exactly.
- `actualHash` contains the checksum computed from the target file under the selected algorithm.
- `valid` records the normalized comparison outcome.

The endpoint must not invent auxiliary metadata fields in the verification result surface.

### Summary invariants

The summary carries three distinct counts:

- `validCount` for successful comparisons whose normalized hashes matched
- `invalidCount` for successful comparisons whose normalized hashes did not match
- `errorCount` for failures where no comparison result could be produced

`invalidCount` is not the same thing as `errorCount`. An invalid comparison still produced a valid checksum computation and therefore belongs in `entries`, not `errors`.

### Ordering rule

- Successful entries preserve request order among files that reached comparison.
- Error entries preserve request order among files that failed before comparison.
- The endpoint must not sort or regroup results by validity, algorithm, or error class.

---

## Text-Formatting Conventions

`verify_file_checksums` uses one caller-visible batch-oriented text surface.

### Formatted output rules

- The text output starts with `Checksum Verification Results (<algorithm>):`.
- The summary header renders valid, invalid, and error counts before any file sections.
- Valid files are grouped under `Valid Files:` and list only the verified paths.
- Invalid files are grouped under `Invalid Files:` and include both expected and actual hash lines.
- Failures are grouped under a dedicated `Errors:` section.

This text formatting is a convenience surface only. The structured `entries` / `errors` / `summary` contract remains the authoritative result model.

### Metadata-family budget rule

Although this endpoint performs integrity verification rather than plain metadata lookup, its caller-visible text output still remains under the metadata-family response budget.

That means:

- verification output must stay concise
- oversized formatted verification output is refused by the shared metadata-family text budget
- this endpoint does **not** expose preview-style continuation or resume metadata to work around text-budget limits

---

## Integrity-Family Boundary Conventions

`verify_file_checksums` belongs to the metadata and integrity family, but it owns only checksum verification.

The endpoint-specific implications are:

- it is read-only
- it is file-oriented rather than directory-oriented
- it compares actual hashes against caller-supplied expected hashes
- it surfaces both per-file verification outcomes and aggregate summary counts
- it preserves partial failures without collapsing the whole request into one undifferentiated failure state

Checksum generation belongs to the separate sibling endpoint `get_file_checksums` and must stay documented there.

---

## Relationship to Sibling Endpoints

### Compared with `get_file_checksums`

`get_file_checksums` answers what checksum each requested file produces.

`verify_file_checksums` answers whether the files match the expected hashes and, when they do not, which actual hashes were observed.

### Compared with `get_path_metadata`

`get_path_metadata` answers a filesystem-fact question about `size`, `type`, and optional grouped metadata.

`verify_file_checksums` answers a read-only integrity-validation question about expected-versus-actual hashes.

### Selection rule

Use `verify_file_checksums` when the caller already knows:

- the file paths
- the expected hashes
- the algorithm that should govern the comparison

and needs:

- pass/fail verification per file
- actual hash visibility for mismatches
- aggregate valid/invalid/error summary counts

Do not use it as a substitute for checksum generation, metadata lookup, discovery, or file-content-reading workflows.

---

## Local Documentation Ownership Split

The endpoint-local documentation triplet is intentionally split by role:

- `CONVENTIONS.md` owns endpoint-local conventions, guardrails, and policy boundaries
- `DESCRIPTION.md` owns the detailed endpoint architecture for LLM-agent use
- `README.md` owns the concise developer-facing summary

Root-level documentation is expected to re-reference this endpoint-local triplet later. This file must therefore stay endpoint-local and must not drift into root-level TOC ownership.
