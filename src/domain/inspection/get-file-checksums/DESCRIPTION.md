# DESCRIPTION — `get_file_checksums` Endpoint

## Purpose

`get_file_checksums` computes structured checksum results for one or more explicitly requested files.

It is the inspection surface for callers that already know which files they want to inspect and need deterministic hash output rather than metadata facts, path discovery, or verification judgments.

Use this endpoint when the question is:

- what hash each requested file produces
- which supported algorithm should be used for the generated digest
- which requested files failed path validation or checksum generation while sibling files still succeeded

Do not use this endpoint when the real need is directory listing, metadata lookup, file-content reading, or checksum verification against expected values.

---

## Request Model

### Base request surface

The base request is rooted in these fields:

- `paths` — one or more requested file paths
- `algorithm` — the selected hash algorithm

The important endpoint-local defaults are:

- `paths` must be present on base requests
- `algorithm` defaults to `sha256`
- algorithm selection is limited to the schema-owned enum

### Algorithm selection semantics

The schema controls which checksum algorithms are allowed.

That means:

- the endpoint does not accept arbitrary digest names
- the caller-visible algorithm value is deterministic and explicit
- the local docs must describe the default and the supported set without inventing additional algorithms

---

## Response Model

### Structured surface

The structured response is intentionally modeled as partial-success output:

- `entries[]` contains successful checksum results
- `errors[]` contains per-file failures

Each successful entry contains:

- `path`
- `hash`

Each error entry contains:

- `path`
- `error`

This contract allows one request to preserve both successful hashes and failed files without collapsing the entire batch into a single failure state.

### Text surface

The text surface is caller-visible convenience output.

- the output begins with the selected algorithm label
- each successful checksum line uses `<hash>  <path>` formatting
- failed files are grouped under `Errors:`

The structured `entries` / `errors` surface remains the authoritative machine-facing result model.

---

## Validation and Execution Flow

`get_file_checksums` follows a strict file-validation flow before checksum generation is attempted.

Its runtime flow is:

1. accept the caller-requested `paths`
2. validate each path against the allowed-directory boundary
3. compute the file hash for each valid path using the selected algorithm
4. capture generation failures as per-file `errors`
5. assemble the structured `entries` / `errors` response
6. format the caller-visible checksum text output
7. enforce the metadata-family text-response budget

This means the endpoint is not a raw hashing passthrough. It remains a server-owned inspection surface with explicit path authorization and bounded caller-visible output behavior.

---

## Partial-Success Semantics

One of the most important local behaviors of this endpoint is partial success.

### Why it exists

Callers often want checksum generation over several files in one request. Some files may fail because they are:

- outside the allowed-directory boundary
- missing
- invalid for path resolution
- otherwise unreadable to the checksum generator

The endpoint therefore preserves successful checksum entries and failed file errors together in one structured result instead of discarding the successful hashes.

### What it means for consumers

- `entries` are not proof that every requested file succeeded
- `errors` are not proof that the whole request failed
- consumers must inspect both arrays for batch requests

This is important for autonomous agents that may otherwise mistake a non-empty `entries` array for full batch success.

---

## Output-Budget Semantics

This endpoint remains part of the metadata and integrity family for caller-visible response budgeting.

That means:

- checksum text output must remain concise
- the caller-visible text surface is bounded by the metadata-family response cap
- the endpoint does not expose preview-style resume behavior as a workaround for oversized output

This is a bounded batch-inspection surface, not a continuation-driven discovery family.

---

## Ordering and Stability Invariants

This endpoint preserves several invariants that matter for autonomous agents and deterministic workflows:

- requested file paths are echoed exactly in the resulting success or error object that represents them
- successful checksum entries preserve request order among successful files
- failed file errors preserve request order among failed files
- the selected hash algorithm is applied consistently across the whole request batch
- the formatted text output is deterministic for the same structured result

These invariants make repeated checksum inspection easier to compare and safer to use in follow-up integrity workflows.

---

## Relationship to Other Inspection Surfaces

### Versus `verify_file_checksums`

`verify_file_checksums` compares files against expected hashes and produces verification judgments.

`get_file_checksums` only generates the hashes. It does not evaluate them against expected values.

### Versus `get_path_metadata`

`get_path_metadata` answers a filesystem-fact question about `size`, `type`, and optional grouped metadata.

`get_file_checksums` answers a read-only integrity-generation question about deterministic file hashes.

### Versus discovery surfaces

Discovery endpoints help find paths.

`get_file_checksums` assumes the caller already knows the file paths and now wants checksum output for them.

---

## Why This Endpoint Needs Local Documentation

The root documentation set owns the project-wide TOC and shared architecture references.

This endpoint-local description exists because `get_file_checksums` has endpoint-specific behavior that cannot be explained precisely enough by root-level TOC text alone:

- checksum-generation-only scope
- algorithm selection with a schema-owned default
- partial-success `entries` / `errors` output
- validated path scope before hash generation
- metadata-family text-budget behavior without preview-style resume semantics

That endpoint-local detail belongs here, while broader cross-family ownership remains shared.
