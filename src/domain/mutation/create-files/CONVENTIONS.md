# CONVENTIONS — `create_files` Endpoint

## Endpoint-Local SSOT Role

This file is the endpoint-local single source of truth for `create_files` conventions and guardrails.

- `CONVENTIONS.md` owns endpoint-local rules, policy boundaries, and caller-facing guardrails.
- `DESCRIPTION.md` owns the detailed agent-oriented architecture explanation.
- `README.md` owns the concise DX summary.

The workspace-level [`CONVENTIONS.md`](../../../../CONVENTIONS.md) is a TOC surface and should re-reference this local file instead of duplicating endpoint-specific detail.

---

## Architectural Principle: New-File Creation Only

`create_files` creates new text files only.

It must not be documented as:

- an append surface,
- a targeted replacement surface,
- or a generic overwrite endpoint.

If the target file already exists, this endpoint refuses the write instead of modifying the file in place.

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

## Architectural Principle: Additive Creation Boundary

This endpoint is additive in one specific sense: it materializes new files that do not yet exist.

Its current behavior is:

- validate the requested path for creation,
- reject the operation when the file already exists,
- create missing parent directories automatically,
- write the full caller-supplied text content as UTF-8,
- return a concise mutation summary instead of echoing large payloads.

---

## Architectural Principle: Existing-File Refusal

If the target file already exists, `create_files` must refuse the write.

The current refusal guidance points callers to a modification surface instead of silently overwriting the existing file.

This boundary is mandatory and must remain explicit in endpoint-local documentation.

---

## Architectural Principle: Contrast with Nearby Mutation Surfaces

`create_files` must stay clearly separated from the nearby content-mutation surfaces:

- `append_files` owns additive end-of-file writes for existing files.
- `replace_file_line_ranges` owns targeted existing-file replacement over inclusive line ranges.
- `create_files` owns full content materialization for non-existing files.

These roles must not be blurred into one undifferentiated local contract.

---

## Architectural Principle: Budgeted Mutation Summary

Successful output is intentionally small.

The handler formats a concise mutation summary and then enforces the mutation-summary budget rather than mirroring large caller-supplied content back to the client.

The currently relevant local output limit is:

- `PATH_MUTATION_SUMMARY_CAP_CHARS = 60,000`

The endpoint also participates in the shared cumulative content-bearing mutation input budget described by the existing guardrail SSOT surfaces.

---

## Re-Referenced Shared Guardrails

This endpoint re-references generic SSOT surfaces instead of redefining them:

- [Guardrails Overview](../../../../conventions/guardrails/overview.md)
- [MCP Client Governance](../../../../conventions/guardrails/mcp-client-governance.md)

These shared documents own the cross-endpoint budget and guardrail model. This local file documents only how those rules apply to `create_files`.

---

## Root Documentation Relationship

The workspace-level [`README.md`](../../../../README.md), [`DESCRIPTION.md`](../../../../DESCRIPTION.md), and [`CONVENTIONS.md`](../../../../CONVENTIONS.md) are root TOC surfaces.

They must later reference this local triplet for endpoint-specific additive creation detail instead of re-centralizing the `create_files` contract at root level.
