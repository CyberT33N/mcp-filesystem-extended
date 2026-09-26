# CONVENTIONS — `verify_symbolic_links` Endpoint

## Purpose of This Document

This document is the endpoint-local single source of truth for the non-obvious conventions, guardrails, and architectural boundaries of `verify_symbolic_links`.

Shared cross-family rules remain owned by the workspace-level conventions index and the shared guardrail slices, especially [`public-limit-disclosure-governance.md`](../../../../conventions/guardrails/public-limit-disclosure-governance.md). This file does not duplicate those broader rules. It explains how they apply specifically to the symbolic-link verification surface.

---

## What This Endpoint Is

`verify_symbolic_links` is the read-only integrity-verification surface for one or more explicitly requested symbolic links.

Its contract is:

> Validate each requested link path against the allowed-directory boundary, prove the entry is a symbolic link, read its stored target text, prove whether the target currently resolves, optionally compare the stored target against a caller-supplied expectation, preserve per-link failures, and return an aggregate verification summary.

This endpoint is intentionally distinct from adjacent inspection surfaces:

- It does **not** list directory contents.
- It does **not** discover paths.
- It does **not** read file body content for caller consumption.
- It does **not** create or repair links.

Instead, it answers one question only:

> Are the requested paths symbolic links whose stored targets match expectations and currently resolve?

---

## Request-Surface Conventions

### Base requests

- Base requests must provide at least one object in `links`.
- Every `links` item must carry `path`; `expectedTarget` is optional.
- The request batch remains bounded by the shared generic path-request ceiling.

### Verification scope

- This endpoint documents symbolic-link verification only.
- It must not drift into link-creation semantics owned by `create_symbolic_links`.
- It must not drift into generic metadata lookup owned by `get_path_metadata`.

### Path-authority boundary

- Every requested path is validated through the allowed-directory guard before verification begins.
- The guard proof preserves the link identity: the endpoint inspects the link itself, never the resolved target in its place.
- A caller-supplied link path does not bypass server-owned path authorization.

---

## Comparison and Resolvability Conventions

### Verbatim comparison rule

Link targets are stored verbatim, so target comparison is intentionally strict about the path identity.

- The stored target text is read with `readlink` and echoed as `actualTarget`.
- When `expectedTarget` is supplied, comparison is exact equality after trimming surrounding whitespace and applying the platform separator normalization.
- The platform normalization exists because Windows stores targets with normalized backslash separators even when the link was created with forward slashes; comparing path identity instead of byte form keeps the contract operating-system agnostic.
- On POSIX, a backslash stays a legal filename character and is never rewritten into a path separator.
- No semantic path rewriting is applied beyond separators; target drift still mismatches.

### Resolvability rule

- `resolvable` reports whether the link's target currently resolves to an existing filesystem entry.
- A dangling link is a negative judgment (`resolvable: false`, `valid: false`), never an error: the link exists and was fully inspected.
- A path that is not a symbolic link at all reports `actualTarget: null`, `resolvable: false`, and `valid: false`.
- A link whose resolved target escapes the allowed directories is a scope violation and surfaces as an error entry.

### Validity rule

`valid` requires all applicable dimensions at once:

- the path is a symbolic link,
- the target currently resolves,
- and, when `expectedTarget` was supplied, the stored target text matched.

---

## Structured Result Conventions

### Result split

The structured result is intentionally split into:

- `entries` for produced verification judgments, including negative judgments
- `errors` for link-level failures that prevented a judgment
- `summary` for aggregate verification counts

This split is required because the endpoint supports partial success. One unreadable or out-of-scope path must not discard successful verification results from sibling links in the same request.

### Entry-level invariants

Every entry must preserve these local invariants:

- `path` echoes the caller-requested path exactly.
- `expectedTarget` echoes the caller-supplied expectation exactly when supplied.
- `actualTarget` contains the verbatim stored target text, or `null` for non-link paths.
- `resolvable` records the current target-resolution state.
- `valid` records the combined verification outcome.

The endpoint must not invent auxiliary metadata fields in the verification result surface.

### Summary invariants

The summary carries three distinct counts:

- `validCount` for links that passed every applicable dimension
- `invalidCount` for links that produced a negative judgment
- `errorCount` for attempts that failed before a judgment could be produced

`invalidCount` is not the same thing as `errorCount`. A dangling or mismatching link still produced a full inspection and therefore belongs in `entries`, not `errors`.

### Ordering rule

- Entries preserve request order among links that reached a judgment.
- Error entries preserve request order among links that failed before a judgment.
- The endpoint must not sort or regroup results by validity or error class.

---

## Text-Formatting Conventions

`verify_symbolic_links` uses one caller-visible batch-oriented text surface.

### Formatted output rules

- The text output starts with `Symbolic Link Verification Results:`.
- The summary header renders valid, invalid, and error counts before any link sections.
- Valid links are grouped under `Valid Links:` and list only the verified paths.
- Invalid links are grouped under `Invalid Links:` and include expected, actual, and resolvability lines.
- Failures are grouped under a dedicated `Errors:` section.

This text formatting is a convenience surface only. The structured `entries` / `errors` / `summary` contract remains the authoritative result model.

### Metadata-family budget rule

This endpoint performs integrity verification rather than plain metadata lookup, but its caller-visible text output still remains under the metadata-family response budget.

That means:

- verification output must stay concise
- oversized formatted verification output is refused by the shared metadata-family text budget
- this endpoint does **not** expose preview-style continuation or resume metadata to work around text-budget limits

---

## Public Limit Disclosure Placement

`verify_symbolic_links` belongs to the metadata and integrity family and follows the global public-limit-disclosure policy with an integrity-verification emphasis.

### Parameter-description disclosure (required)

Stable request-shape limits belong in the schema-owned parameter descriptions because callers need them while constructing the request.

For `verify_symbolic_links`, that includes:

- path-length limits via `PATH_MAX_CHARS` on `path` and `expectedTarget`
- link-entry count ceiling via `MAX_GENERIC_PATHS_PER_REQUEST`

The endpoint-local rule is therefore:

> Request-shape limits must be disclosed in [`schema.ts`](./schema.ts) through constant-backed parameter descriptions.

### Tool-description disclosure (selective)

Stable operation-wide delivery rules may appear in the runtime tool description. For `verify_symbolic_links`, the important runtime rule is that:

- caller-visible verification output remains bounded by the metadata-family response budget
- oversized multi-link verification requests may still be refused

### Non-prioritized internal limits (required non-disclosure rationale)

This endpoint must not promote the following internal or broader server-owned limits into its routine public tool description as if they were the primary caller target:

- the exact global fuse as the dominant optimization number
- internal comparison or resolvability implementation mechanics
- server-internal emergency/runtime guardrails

Those surfaces remain owned by shared architecture conventions because they are server-internal protection mechanics rather than the primary caller-actionable contract.

---

## Integrity-Family Boundary Conventions

`verify_symbolic_links` belongs to the metadata and integrity family, but it owns only symbolic-link verification.

The endpoint-specific implications are:

- it is read-only
- it is link-oriented rather than file-content-oriented
- it compares stored targets against caller-supplied expectations
- it proves target resolvability as a first-class dimension
- it surfaces both per-link verification outcomes and aggregate summary counts
- it preserves partial failures without collapsing the whole request into one undifferentiated failure state

Link creation belongs to the separate sibling endpoint `create_symbolic_links` and must stay documented there.

---

## Relationship to Sibling Endpoints

### Compared with `create_symbolic_links`

`create_symbolic_links` answers the mutation question of materializing new links.

`verify_symbolic_links` answers the time-independent integrity question: drift, dangling state, external overwrite, idempotency pre-checks, and read-only audits. A successful creation only proves the state at creation time; verification answers the ongoing integrity question.

### Compared with `get_path_metadata`

`get_path_metadata` answers a filesystem-fact question about `size`, `type`, and optional grouped metadata, including the resolved link target.

`verify_symbolic_links` answers a read-only integrity-validation question about expected-versus-stored targets and target resolvability.

### Selection rule

Use `verify_symbolic_links` when the caller already knows:

- the link paths
- optionally the expected stored targets

and needs:

- pass/fail verification per link
- stored-target visibility for mismatches
- dangling-link detection
- aggregate valid/invalid/error summary counts

Do not use it as a substitute for link creation, metadata lookup, discovery, or file-content-reading workflows.

---

## Local Documentation Ownership Split

The endpoint-local documentation triplet is intentionally split by role:

- `CONVENTIONS.md` owns endpoint-local conventions, guardrails, and policy boundaries
- `DESCRIPTION.md` owns the detailed endpoint architecture for LLM-agent use
- `README.md` owns the concise developer-facing summary

Root-level documentation is expected to re-reference this endpoint-local triplet later. This file must therefore stay endpoint-local and must not drift into root-level TOC ownership.
