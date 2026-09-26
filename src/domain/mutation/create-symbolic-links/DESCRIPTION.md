# DESCRIPTION — `create_symbolic_links` Endpoint

## Purpose

`create_symbolic_links` creates one or more new symbolic links from caller-supplied link paths and targets, and returns a concise mutation summary.

It is the additive link-materialization surface of the path-mutation family.

---

## Public Request Contract

The caller sends `links`, where each entry contains:

- `linkPath`
- `target`
- optionally `type`

The current schema validates the batch size and the path lengths before the handler runs.

The public registration surface exposes `create_symbolic_links` as the new-link creation tool whose existing link paths are refused rather than overwritten.

---

## Portability Contract

The endpoint supports relative and absolute targets through one `target` field.

- A relative target is stored verbatim and resolves against the link's directory at access time — portable across checkouts and machines.
- An absolute target is stored as-is — stable against link moves, but machine-dependent.
- The stored text is never normalized before creation.
- The resolved target form is scope-checked against the allowed directories before creation.
- Dangling creation (a target that does not exist yet) is legal.

On Windows, a directory link whose target must exist at creation time gets its type from the runtime autodetection or from an explicit `type` value.

---

## Windows Readiness Contract

Portable symbolic-link creation on Windows requires the host to satisfy exactly one of:

- Windows Developer Mode enabled (recommended),
- an elevated server process.

The server never self-elevates and never probes the environment beforehand. When the host denies creation, the affected entry fails with the deterministic `symlink_privilege_missing` failure family, which names the blocking layer (OS policy) and the next valid action (Developer Mode, elevation, or the privilege-free `junction` variant for directory links).

Linux and macOS require no special privilege: write permission on the parent directory is sufficient.

---

## Public Limit Disclosure Model

For this endpoint, limit disclosure is intentionally split across two public surfaces.

### Parameter surface

Parameter descriptions carry the stable request-shape limits that callers need while constructing the request:

- path-length limits on `linkPath` and `target`
- maximum link-entry count

### Tool-description surface

The runtime tool description carries the stable operation-wide delivery rules:

- successful output remains a concise mutation summary rather than an echoed payload
- existing link paths are refused instead of being overwritten
- relative targets are stored verbatim and resolve against the link's directory
- Windows portable link creation requires Developer Mode or an elevated process, with `junction` as the privilege-free directory alternative

### Intentional non-disclosure in routine tool text

The routine tool description does not prioritize:

- the exact global fuse as the primary planning number
- internal link-materialization implementation mechanics
- server-internal emergency/runtime guardrails

Those surfaces remain owned by shared architecture conventions because they are server-internal protection mechanics rather than the primary caller-actionable contract.

---

## Execution Pipeline

The current additive link-creation flow is:

1. the application catalog registers `create_symbolic_links` in [`registerComparisonAndMutationToolCatalog()`](../../../application/server/register-comparison-and-mutation-tool-catalog.ts),
2. [`CreateSymbolicLinksArgsSchema`](./schema.ts) validates the public `links` array,
3. [`handleCreateSymbolicLinks()`](./handler.ts) enforces the shared path-mutation batch budget before any filesystem write begins,
4. the handler validates each requested link path for creation,
5. the handler refuses the creation when the link path already exists — including an existing dangling link,
6. the handler scope-checks the resolved target form against the allowed directories,
7. the handler creates missing parent directories automatically,
8. the handler stores the caller-supplied target verbatim through the filesystem symlink call and returns a concise mutation summary.

This endpoint therefore owns additive new-link creation, not modification of existing links.

---

## Mutation-Family Boundary

`create_symbolic_links` is intentionally distinct from the nearby mutation surfaces.

- `create_symbolic_links` materializes link entries that reference other paths.
- `create_files` materializes full text content into non-existing files.
- `create_directories` materializes directory paths.
- `delete_paths` owns deliberate removal, including the removal of a link before a planned re-creation.

This distinction must remain explicit in all endpoint-local documentation.

---

## Output Model

The endpoint returns a concise mutation summary rather than echoing the full caller payload.

This summary:

- records successful creates,
- records link-level failures, including the deterministic `symlink_privilege_missing` family,
- stays bounded by the mutation-summary response budget.

---

## Relevant Source-of-Truth Surfaces

The current endpoint contract is derived from these concrete surfaces:

- [`schema.ts`](./schema.ts)
- [`handler.ts`](./handler.ts)
- [`register-comparison-and-mutation-tool-catalog.ts`](../../../application/server/register-comparison-and-mutation-tool-catalog.ts)
- [`create-files/schema.ts`](../create-files/schema.ts)
- [`delete-paths/handler.ts`](../delete-paths/handler.ts)
- [`README.md`](../../../../README.md)
- [`DESCRIPTION.md`](../../../../DESCRIPTION.md)

The root TOC documents remain higher-level entry surfaces only.

---

## Local Documentation Ownership

- `CONVENTIONS.md` owns endpoint-local rules and guardrails.
- `DESCRIPTION.md` owns the detailed architecture explanation for LLM agents.
- `README.md` owns the concise developer-facing summary.

Root TOC documentation later re-references this local triplet instead of duplicating the endpoint contract.
