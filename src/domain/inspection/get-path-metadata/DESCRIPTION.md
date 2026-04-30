# DESCRIPTION — `get_path_metadata` Endpoint

## Purpose

`get_path_metadata` returns structured filesystem metadata for one or more explicitly requested file or directory paths.

It is the inspection surface for callers that already know the paths they want to inspect and need structured facts rather than discovery results, file content, or integrity hashes.

Use this endpoint when the question is:

- what `size` and `type` belong to these paths
- whether grouped timestamp metadata is needed
- whether grouped permission metadata is needed
- which requested paths failed validation or lookup while sibling paths still succeeded

Do not use this endpoint when the real need is directory listing, path discovery, content reading, or checksum generation/verification.

---

## Request Model

### Base request surface

The base request is rooted in these fields:

- `paths` — one or more requested files or directories
- `metadata` — optional grouped metadata selectors

The important endpoint-local defaults are:

- `paths` must be present on base requests
- `size` and `type` are always returned
- timestamp metadata is opt-in
- permission metadata is opt-in

### Metadata selection semantics

The grouped metadata selectors widen output shape without changing the endpoint's ownership model:

- the endpoint always returns the base filesystem facts
- grouped metadata is added only when the caller explicitly requests it
- the endpoint does not infer that timestamps or permissions are always needed just because those groups exist in the schema

---

## Response Model

### Structured surface

The structured response is intentionally modeled as partial-success output:

- `entries[]` contains successful metadata results
- `errors[]` contains failed lookups

Each successful entry contains:

- `path`
- `size`
- `type`
- optional grouped timestamp fields
- optional grouped permission fields

Each error entry contains:

- `path`
- `error`

This contract allows one request to report both successful and failed path lookups without collapsing the whole batch into a single success-or-failure state.

### Text surface

The text surface is caller-visible convenience output.

- one requested path becomes a compact key-value metadata block
- multiple requested paths become a grouped batch report built from successful entries and error entries

The structured `entries` / `errors` surface remains the authoritative machine-facing result model.

---

## Validation and Resolution Flow

`get_path_metadata` follows a strict path-first validation flow before metadata is resolved.

Its runtime flow is:

1. accept the caller-requested `paths`
2. validate each path against the allowed-directory boundary
3. resolve filesystem metadata for each valid path
4. capture lookup failures as per-path `errors`
5. assemble the structured `entries` / `errors` response
6. format the caller-visible single-path or batch text output
7. enforce the metadata-family text-response budget

This means the endpoint is not a raw filesystem stat passthrough. It remains a server-owned inspection surface with explicit path-authorization and bounded output behavior.

---

## Partial-Success Semantics

One of the most important local behaviors of this endpoint is partial success.

### Why it exists

Callers often want one metadata batch over several paths. Some paths may fail because they are:

- outside the allowed-directory boundary
- missing
- invalid
- otherwise unreadable to the metadata resolver

The endpoint therefore keeps successful results and failed lookups together in one structured response instead of failing the whole batch prematurely.

### What it means for consumers

- `entries` are not proof that every requested path succeeded
- `errors` are not proof that the whole request failed
- consumers must read both arrays when more than one path is requested

This is especially important for autonomous agents that may otherwise mistake a non-empty `entries` array for full batch success.

---

## Ordering and Stability Invariants

This endpoint preserves several invariants that matter for autonomous agents and deterministic workflows:

- requested paths are echoed exactly in the resulting success or error object that represents them
- successful entries preserve request order among successful lookups
- failed lookups preserve request order among failed lookups
- grouped metadata appears only when selected
- single-path and batch text formatting are deterministic for the same structured result

These invariants make repeated metadata inspection safer to compare and easier to reason about when agents perform follow-up operations.

---

## Relationship to Other Inspection Surfaces

### Versus `list_directory_entries`

`list_directory_entries` answers a structure-and-recursion question.

`get_path_metadata` answers a path-fact question for explicitly requested targets.

### Versus `find_paths_by_name` and `find_files_by_glob`

Those endpoints discover candidate paths.

`get_path_metadata` assumes the caller already knows the paths and now wants structured metadata facts about them.

### Versus checksum endpoints

Checksum endpoints answer integrity questions.

`get_path_metadata` never computes or verifies hashes. It remains a metadata-only inspection surface.

---

## Why This Endpoint Needs Local Documentation

The root documentation set owns the project-wide TOC and shared architecture references.

This endpoint-local description exists because `get_path_metadata` has endpoint-specific behavior that cannot be explained precisely enough by root-level TOC text alone:

- grouped metadata selectors
- partial-success `entries` / `errors` output
- single-path versus batch text formatting split
- allowed-directory validation before metadata resolution
- metadata-family response-budget behavior without preview-style resume semantics

That endpoint-local detail belongs here, while broader cross-family ownership remains shared.
