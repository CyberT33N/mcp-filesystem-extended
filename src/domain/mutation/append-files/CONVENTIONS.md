# CONVENTIONS — `append_files` Endpoint

## Endpoint-Local SSOT Role

This file is the endpoint-local single source of truth for `append_files` conventions and guardrails.

- `CONVENTIONS.md` owns endpoint-local rules, policy boundaries, and caller-facing guardrails.
- `DESCRIPTION.md` owns the detailed agent-oriented architecture explanation.
- `README.md` owns the concise DX summary.

The workspace-level [`CONVENTIONS.md`](../../../../CONVENTIONS.md) is a TOC surface and should re-reference this local file instead of duplicating endpoint-specific detail.

This endpoint also follows the global public-limit-disclosure policy in [`public-limit-disclosure-governance.md`](../../../../conventions/guardrails/public-limit-disclosure-governance.md).

---

## Architectural Principle: Append-at-End Only

`append_files` owns additive writes at file end.

It must not be documented as:

- an explicit new-file-only creation surface,
- a targeted replacement surface,
- or a generic overwrite endpoint.

If the target file already exists, appended content is added at the end of that file.

---

## Architectural Principle: Public Batch Contract

The public request surface is `files`.

Each entry uses the caller-facing fields:

- `path`
- `content`

The current schema accepts:

- at least `1` file entry,
- at most `50` file entries per request,
- path strings up to `4,096` characters,
- and per-file raw text content up to `150,000` characters.

The endpoint also participates in the cumulative content-bearing mutation input budget described by the shared guardrail model.

---

## Architectural Principle: Additive Append Boundary

This endpoint is additive in one specific sense: it appends caller-supplied text at file end.

Its current behavior is:

- validate the requested target path,
- create missing parent directories automatically,
- append the full caller-supplied text content as UTF-8,
- return a concise mutation summary instead of echoing large payloads.

---

## Architectural Principle: Current Create-if-Missing Runtime Behavior

The current append runtime does not refuse a missing target file.

Because the handler creates parent directories and then appends through the filesystem append surface, a missing target file is currently materialized before appended content is written.

This behavior must remain explicit in endpoint-local documentation because it differs from the explicit existing-target refusal contract owned by `create_files`.

---

## Architectural Principle: Contrast with Nearby Mutation Surfaces

`append_files` must stay clearly separated from the nearby content-mutation surfaces:

- `create_files` owns explicit new-file creation with refusal on already existing targets.
- `replace_file_line_ranges` owns targeted existing-file replacement over inclusive line ranges.
- `append_files` owns additive file-end writes and the current create-if-missing runtime behavior.

These roles must not be blurred into one undifferentiated local contract.

---

## Architectural Principle: Budgeted Mutation Summary

Successful output is intentionally small.

The handler formats a concise mutation summary and then enforces the shared path-mutation summary budget rather than mirroring large caller-supplied content back to the client.

The endpoint also participates in the shared cumulative content-bearing mutation input budget described by the existing guardrail SSOT surfaces.

---

## Public Limit Disclosure Placement

`append_files` belongs to the mutation family and follows the global public-limit-disclosure policy with a request-shape-first emphasis.

### Parameter-description disclosure (required)

Stable request-shape limits belong in the schema-owned parameter descriptions because callers need them while constructing the append payload.

For `append_files`, that includes:

- path-length limits via `PATH_MAX_CHARS`
- per-file content limits via `RAW_CONTENT_MAX_CHARS`
- batch entry count via `MAX_CONTENT_FILES_PER_REQUEST`
- cumulative content-bearing mutation budgeting where the request contract surfaces it

The endpoint-local rule is therefore:

> Request-shape limits must be disclosed in [`schema.ts`](./schema.ts) through constant-backed parameter descriptions.

### Tool-description disclosure (selective)

Stable operation-wide delivery rules may appear in the runtime tool description, but this family prioritizes concise request-shape communication over aggressive numeric tool-description disclosure.

For `append_files`, the important runtime rule is that:

- successful output remains a concise mutation summary rather than an echoed payload
- oversized append payloads are refused rather than truncated

### Non-prioritized internal limits (required non-disclosure rationale)

This endpoint must not promote the following internal or broader server-owned limits into its routine public tool description as if they were the primary caller target:

- the exact global fuse as the dominant optimization number
- internal append-write implementation mechanics
- server-internal emergency/runtime guardrails

Those surfaces remain owned by shared architecture conventions because they are server-internal protection mechanics rather than the primary caller-actionable contract.

---

## Re-Referenced Shared Guardrails

This endpoint re-references generic SSOT surfaces instead of redefining them:

- [Guardrails Overview](../../../../conventions/guardrails/overview.md)
- [MCP Client Governance](../../../../conventions/guardrails/mcp-client-governance.md)

These shared documents own the cross-endpoint budget and guardrail model. This local file documents only how those rules apply to `append_files`.

---

## Root Documentation Relationship

The workspace-level [`README.md`](../../../../README.md), [`DESCRIPTION.md`](../../../../DESCRIPTION.md), and [`CONVENTIONS.md`](../../../../CONVENTIONS.md) are root TOC surfaces.

They must later reference this local triplet for endpoint-specific additive append detail instead of re-centralizing the `append_files` contract at root level.
