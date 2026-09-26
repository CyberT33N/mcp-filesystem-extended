# DESCRIPTION — `verify_symbolic_links` Endpoint

## Purpose

`verify_symbolic_links` computes structured symbolic-link verification results for one or more explicitly requested links.

It is the inspection surface for callers that already know which links they want to validate and optionally already have the expected stored target text they want to compare against.

Use this endpoint when the question is:

- whether each requested path is a symbolic link whose target resolves
- which links match or miss their expected stored target
- which links are dangling
- which requests failed before a verification judgment could be produced
- how the aggregate verification summary breaks down across valid, invalid, and error outcomes

Do not use this endpoint when the real need is link creation, directory listing, metadata lookup, or file-content reading.

---

## Request Model

### Base request surface

The base request is rooted in this field:

- `links` — one or more requested link entries with `path` and optional `expectedTarget`

The important endpoint-local defaults are:

- `links` must be present on base requests
- every `links` item must contain `path`
- `expectedTarget` is optional; when omitted, only link existence and target resolvability are verified

The public request contract exposes stable caller-actionable request limits directly on the parameter surface:

- link paths remain bounded by the shared path-length cap
- expected targets remain bounded by the shared path-length cap
- the request batch remains bounded by the shared generic path-count ceiling

### Expected-target semantics

The expected target is compared against the stored target text.

That means:

- comparison is exact equality after trimming and platform separator normalization
- the separator normalization exists because Windows stores targets with normalized backslash separators even when the link was created with forward slashes
- no semantic path rewriting is applied beyond separators, because rewriting would hide target drift
- the stored target of a portable relative link keeps its relative form in `actualTarget`

---

## Response Model

### Structured surface

The structured response is intentionally modeled as partial-success output:

- `entries[]` contains produced verification judgments
- `errors[]` contains per-link failures
- `summary` contains aggregate counts

Each successful entry contains:

- `path`
- `expectedTarget` (when supplied)
- `actualTarget` (or `null` for non-link paths)
- `resolvable`
- `valid`

Each error entry contains:

- `path`
- `expectedTarget` (when supplied)
- `error`

The summary contains:

- `validCount`
- `invalidCount`
- `errorCount`

This contract allows one request to preserve matching links, mismatching links, dangling links, and failed links together without collapsing the batch into one coarse result.

### Text surface

The text surface is caller-visible convenience output.

- the output begins with the `Symbolic Link Verification Results:` header
- the summary header exposes valid, invalid, and error totals first
- valid links are grouped separately from invalid links
- invalid links include expected, actual, and resolvability lines
- failed links are grouped under `Errors:`

The structured `entries` / `errors` / `summary` surface remains the authoritative machine-facing result model.

---

## Validation and Execution Flow

`verify_symbolic_links` follows a strict validation and inspection flow before a verification result is emitted.

Its runtime flow is:

1. accept the caller-requested `links`
2. validate each `path` against the allowed-directory boundary while preserving the link identity
3. read the directory entry with `lstat` and prove the entry is a symbolic link
4. read the stored target text with `readlink`
5. prove target resolvability with a non-throwing `stat`
6. classify the judgment as valid or invalid
7. capture pre-judgment failures as per-link `errors`
8. assemble the structured `entries`, `errors`, and `summary` response
9. format the caller-visible verification text output
10. enforce the metadata-family text-response budget

This means the endpoint is not a raw readlink helper. It remains a server-owned inspection surface with explicit path authorization, link-identity proof, structured batch results, and bounded caller-visible output behavior.

---

## Link-Identity Guard Semantics

The scope proof intentionally preserves the link identity.

A target-following guard would resolve the link to its target and inspect the target instead of the link. This endpoint therefore uses the creation-style guard surface, which validates the requested link path and its nearest existing ancestor without resolving the link away.

The verification reads stay link-local: the stored target text and the target's existence are metadata-level facts, never target content.

---

## Partial-Success Semantics

This endpoint distinguishes between three outcome classes inside the same request:

- **valid entries** — the path is a link, the target resolves, and any supplied expectation matched
- **invalid entries** — a full inspection produced a negative judgment (mismatch, dangling, or not a link)
- **error entries** — the endpoint failed before a verification judgment could be produced

### Why this matters

Consumers must not treat `invalid` and `error` as the same state.

- an invalid entry still proves the path was inspected completely
- an error entry means the endpoint failed before a verification judgment could be produced
- a dangling link is an invalid entry, never an error

This is especially important for autonomous agents that may otherwise mistake a non-empty `entries` array for universal success or mistake `errorCount` for the total number of mismatches.

---

## Summary Semantics

The `summary` object is not a decorative surface. It is the endpoint-local aggregate contract that lets consumers inspect batch verification health at a glance.

- `validCount` counts links that passed every applicable dimension
- `invalidCount` counts links with a produced negative judgment
- `errorCount` counts failed verification attempts

The summary therefore complements, but never replaces, the detailed `entries` and `errors` arrays.

---

## Public Limit Disclosure Model

For this endpoint, limit disclosure is intentionally split across two public surfaces.

### Parameter surface

Parameter descriptions carry the stable request-shape limits that callers need while constructing the request:

- path-length limits
- maximum link-entry count

### Tool-description surface

The runtime tool description carries the stable operation-wide delivery rule:

- caller-visible verification output remains bounded by the metadata-family response budget
- oversized multi-link verification requests may be refused rather than treated as a continuation-driven discovery surface

### Intentional non-disclosure in routine tool text

The routine tool description does not prioritize:

- the exact global fuse as the primary planning number
- internal comparison or resolvability implementation mechanics
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

- requested link paths are echoed exactly in the entry or error object that represents them
- `expectedTarget` is echoed exactly for both successful and failed verification attempts when supplied
- entries preserve request order among links that reached a judgment
- failed verification errors preserve request order among links that failed before a judgment
- the formatted text output is deterministic for the same structured result

These invariants make repeated integrity checks easier to compare and safer to use in follow-up workflows.

---

## Relationship to Other Inspection Surfaces

### Versus `get_path_metadata`

`get_path_metadata` answers a filesystem-fact question about `size`, `type`, and optional grouped metadata.

`verify_symbolic_links` answers a read-only integrity-validation question about expected-versus-stored link targets and target resolvability.

### Versus discovery and read surfaces

Discovery endpoints help find paths.

Read endpoints surface file content.

`verify_symbolic_links` assumes the caller already knows the link paths and now wants integrity validation against optional expected targets.

---

## Why This Endpoint Needs Local Documentation

The root documentation set owns the project-wide TOC and shared architecture references.

This endpoint-local description exists because `verify_symbolic_links` has endpoint-specific behavior that cannot be explained precisely enough by root-level TOC text alone:

- link-identity-preserving scope proof instead of target-following validation
- verbatim stored-target comparison semantics
- resolvability as a first-class verification dimension
- `entries` / `errors` / `summary` output with valid-versus-invalid distinction
- metadata-family text-budget behavior without preview-style resume semantics

That endpoint-local detail belongs here, while broader cross-family ownership remains shared.
