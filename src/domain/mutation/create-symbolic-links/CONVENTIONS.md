# CONVENTIONS — `create_symbolic_links` Endpoint

## Endpoint-Local SSOT Role

This file is the endpoint-local single source of truth for `create_symbolic_links` conventions and guardrails.

- `CONVENTIONS.md` owns endpoint-local rules, policy boundaries, and caller-facing guardrails.
- `DESCRIPTION.md` owns the detailed agent-oriented architecture explanation.
- `README.md` owns the concise DX summary.

The workspace-level [`CONVENTIONS.md`](../../../../CONVENTIONS.md) is a TOC surface and should re-reference this local file instead of duplicating endpoint-specific detail.

This endpoint also follows the global public-limit-disclosure policy in [`public-limit-disclosure-governance.md`](../../../../conventions/guardrails/public-limit-disclosure-governance.md).

---

## Architectural Principle: New-Link Creation Only

`create_symbolic_links` creates new symbolic links only.

It must not be documented as:

- an overwrite or re-target surface for existing links,
- a deletion surface,
- or a generic filesystem-write endpoint.

If the link path already exists — as a file, a directory, or a link, including a dangling link — this endpoint refuses the creation instead of replacing the entry.

---

## Architectural Principle: Verbatim Target Storage

The `target` text is stored in the link exactly as supplied.

- A relative target stays relative in the stored link text and resolves against the link's own directory at access time. This keeps the link portable across checkouts, user accounts, and machines.
- An absolute target is stored as-is. It stays stable when the link moves, but remains machine-dependent.
- The server never normalizes a relative target into an absolute one before storage; that normalization would destroy portability.

Scope safety is still enforced: the resolved target form (the target resolved against the link's directory) is validated against the allowed directories before creation, so a relative target cannot escape the server scope through `..` segments. The guard checks the resolved form; the stored form stays verbatim.

Creating a link whose target does not exist yet is legal (dangling creation follows POSIX semantics).

---

## Architectural Principle: Existing-Link Refusal

If the link path already exists, `create_symbolic_links` must refuse the creation.

The existence check is link-identity based (`lstat`), not target-following: a dangling link already occupies its path and must also refuse. A deliberate replacement happens only through an explicit `delete_paths` removal followed by a new creation.

---

## Architectural Principle: Junction Variant, Not a Separate Endpoint

The optional `type` field carries the Windows-only `junction` variant inside this one canonical endpoint:

- `junction` creates a Windows NTFS junction instead of a portable symbolic link: directory targets only, absolute target path (the runtime normalizes automatically), no Developer Mode or elevation required, and not portable across operating systems.
- The default (omitted `type`) remains the portable symbolic link with runtime type autodetection.

A junction is not a substitute for a portable symlink. No separate junction endpoints exist, because the creation question is identical and only the Windows link flavor differs.

---

## Architectural Principle: Consumer-Owned Environment Readiness

Windows portable symbolic-link creation requires exactly one of:

- Windows Developer Mode enabled (recommended), or
- an elevated server process.

This readiness is a consumer/host deployment convention, not a server behavior. The server never self-elevates, never spawns elevated helpers, and never probes the registry: privilege escalation is never the server's domain.

The server also performs no privilege pre-check. The `symlink` syscall itself is the atomic, race-free check; a pre-check would add a second, staleable authority (TOCTOU) and would require registry access that a filesystem server does not own.

When the host denies creation, the per-entry failure is deterministic and remediable:

```text
symlink_privilege_missing (blocking layer: OS policy)
Next valid action: enable Windows Developer Mode OR run the server process elevated
OR retry directory links with type='junction' (privilege-free, not portable)
```

---

## Architectural Principle: Partial-Success Batch

Link-level failures are collected per entry. One failed link never discards successful sibling creations of the same request, and the summary reports both surfaces.

---

## Architectural Principle: Budgeted Mutation Summary

Successful output is intentionally small.

The handler formats a concise mutation summary and then enforces the mutation-summary budget rather than mirroring large caller-supplied path sets back to the client.

The currently relevant local output limit is:

- `PATH_MUTATION_SUMMARY_CAP_CHARS = 60,000`

---

## Public Limit Disclosure Placement

`create_symbolic_links` belongs to the mutation family and follows the global public-limit-disclosure policy with a request-shape-first emphasis.

### Parameter-description disclosure (required)

Stable request-shape limits belong in the schema-owned parameter descriptions because callers need them while constructing the creation payload.

For `create_symbolic_links`, that includes:

- path-length limits via `PATH_MAX_CHARS` on `linkPath` and `target`
- batch entry count via `MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST`

The endpoint-local rule is therefore:

> Request-shape limits must be disclosed in [`schema.ts`](./schema.ts) through constant-backed parameter descriptions.

### Tool-description disclosure (selective)

Stable operation-wide delivery rules may appear in the runtime tool description. For `create_symbolic_links`, the important runtime rules are that:

- successful output remains a concise mutation summary rather than an echoed payload
- existing link paths are refused instead of being overwritten
- relative targets are stored verbatim and resolve against the link's directory
- Windows portable link creation requires Developer Mode or an elevated process, with `junction` as the privilege-free directory alternative

### Non-prioritized internal limits (required non-disclosure rationale)

This endpoint must not promote the following internal or broader server-owned limits into its routine public tool description as if they were the primary caller target:

- the exact global fuse as the dominant optimization number
- internal link-materialization implementation mechanics
- server-internal emergency/runtime guardrails

Those surfaces remain owned by shared architecture conventions because they are server-internal protection mechanics rather than the primary caller-actionable contract.

---

## Re-Referenced Shared Guardrails

This endpoint re-references generic SSOT surfaces instead of redefining them:

- [Guardrails Overview](../../../../conventions/guardrails/overview.md)
- [MCP Client Governance](../../../../conventions/guardrails/mcp-client-governance.md)

These shared documents own the cross-endpoint budget and guardrail model. This local file documents only how those rules apply to `create_symbolic_links`.

---

## Root Documentation Relationship

The workspace-level [`README.md`](../../../../README.md), [`DESCRIPTION.md`](../../../../DESCRIPTION.md), and [`CONVENTIONS.md`](../../../../CONVENTIONS.md) are root TOC surfaces.

They must later reference this local triplet for endpoint-specific symbolic-link creation detail instead of re-centralizing the `create_symbolic_links` contract at root level.
