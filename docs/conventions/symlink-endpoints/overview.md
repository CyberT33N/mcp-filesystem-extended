# Convention: Symbolic-Link Endpoint Ownership and Windows Readiness

> **Context:** See [`CONVENTIONS.md`](../../../CONVENTIONS.md) for the root conventions index of this workspace.
> **Scope:** Server-architecture convention for the `create_symbolic_links` and `verify_symbolic_links` endpoints. Endpoint-local mechanics remain owned by the endpoint-local documentation triplets; this document owns the cross-cutting ownership and environment-readiness decisions.

---

## Purpose

This document is the single source of truth for **what** was decided for the symbolic-link endpoint pair, **how** the endpoints act under those decisions, and **why** — including the domain-driven ownership analysis between consumer and server, the UAC posture, the documentation placement, and the deliberate rejection of a privilege pre-check.

---

## What Was Decided

1. **Exactly two endpoints exist.** `create_symbolic_links` (mutation family) materializes links; `verify_symbolic_links` (inspection family, metadata/integrity) answers the time-independent integrity question. Creation and verification are separate domain questions with different annotations, budgets, and responsibilities; a successful creation only proves the state at creation time.
2. **One `target` field carries relative and absolute targets.** Relative targets are stored verbatim and resolve against the link's directory at access time (portable); absolute targets are stored as-is (machine-dependent). The server never normalizes the stored text.
3. **Junction is a documented `type` enum value, not a separate endpoint pair.** The creation question is identical; only the Windows link flavor differs.
4. **Windows readiness is a consumer-owned deployment convention.** No server-side pre-check exists; the failure contract is deterministic.
5. **The server never works with elevation.** No self-elevation, no elevated helper processes, no UAC prompts, no registry probes.

---

## Ownership Matrix (Domain-Driven Analysis)

| Responsibility | Owner |
|---|---|
| OS policy readiness (Developer Mode **or** elevated server process) | Consumer / host environment |
| Correct syscall usage (the runtime sets the unprivileged-creation flag internally) | Server |
| Deterministic error contract (`symlink_privilege_missing` + next valid action) | Server |
| Privilege-free directory-link variant (`type: "junction"`) | Server |
| Self-elevation, elevated helpers, registry probes | **Forbidden for the server** |

Privilege escalation is never the server's domain: an MCP server runs with the privileges of its host process, and least-privilege plus the process model keep elevation outside the filesystem boundary.

---

## How the Endpoints Act

### Creation flow

1. Schema validation bounds the batch and the path lengths.
2. Each link path is validated for creation against the allowed directories.
3. An existing link path refuses creation — including an existing dangling link, because the existence check is link-identity based (`lstat`), not target-following.
4. The resolved target form (target resolved against the link's directory) is scope-checked against the allowed directories; the stored form stays verbatim.
5. Missing parent directories are created automatically.
6. The link is created through the runtime filesystem surface; per-entry failures are collected (partial success).
7. A concise, budget-bounded mutation summary is returned.

### Verification flow

1. Schema validation bounds the batch and the path lengths.
2. Each link path is scope-proven while preserving the link identity (a target-following guard would resolve the link away).
3. `lstat` proves the entry is a symbolic link; a non-link path is a negative judgment, not an error.
4. `readlink` reads the verbatim stored target text.
5. A non-throwing `stat` proves target resolvability; a dangling link is a negative judgment (`resolvable: false`), not an error.
6. When `expectedTarget` is supplied, the stored text is compared with exact trimmed equality.
7. Structured `entries` / `errors` / `summary` results are returned, mirrored additively into the structured content surface.

### Privilege-denied remediation flow (Windows)

1. The runtime denies creation with `EPERM` when neither Developer Mode nor elevation is present.
2. The handler maps the denial to the deterministic `symlink_privilege_missing` failure family (blocking layer: OS policy).
3. The answer names the next valid action: enable Windows Developer Mode, run the server process elevated, or retry directory links with `type: "junction"` (privilege-free, not portable).
4. An identical retry without an environment change is pointless by construction; cross-tool retry doctrine stays centrally owned.

---

## Why These Decisions Hold

### Why no privilege pre-check

Three binding reasons:

1. **Boundary:** Developer-Mode detection requires registry access (`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock`). This server is a filesystem server without a process or registry capability; probing would breach the boundary.
2. **TOCTOU:** the `symlink` syscall is already the atomic, race-free check. A pre-check would become a second, staleable authority whose answer can expire before the syscall runs.
3. **Ownership:** runtime failure semantics belong to the runtime error contract, not to descriptions and not to a pre-flight.

### Why the server never elevates

Elevation preparation would be an architecture breach: the server's domain is correct syscall usage and honest failure contracts, while the host owns the process privilege level. A server that elevated itself would silently cross the least-privilege boundary its consumers rely on.

### Why junction stays inside the two canonical endpoints

A junction differs from a portable symlink in kind (Windows-only, directory-only, absolute, privilege-free, not portable), but the domain question — materialize or verify a link — is identical, and the runtime creates junctions through the same syscall with `type: "junction"`. Separate junction endpoints would proliferate the tool surface without a new domain question. The honesty requirement is carried by the schema-owned parameter description and the endpoint-local documentation.

### Where each information class lives

| Information class | Owning surface |
|---|---|
| Deployment prerequisite (Developer Mode or elevation) | Root [`README.md`](../../../README.md) and this document |
| Qualitative guard awareness before the call | Tool description of `create_symbolic_links` |
| Exact remediation after a denial | Runtime error contract (`symlink_privilege_missing` failure family) |
| Endpoint-local rules and flows | The endpoint-local documentation triplets |
| Cross-tool retry doctrine | Central retry governance (unchanged) |

---

## Verification

- `create_symbolic_links` on a Windows host without Developer Mode and without elevation answers with the `symlink_privilege_missing` failure family and its next valid action.
- `create_symbolic_links` with `type: "junction"` on a directory target succeeds without elevation.
- `verify_symbolic_links` reports a dangling link as `resolvable: false` and `valid: false` without producing an error entry.
- The endpoint-local triplets ([`create_symbolic_links`](../../../src/domain/mutation/create-symbolic-links/CONVENTIONS.md), [`verify_symbolic_links`](../../../src/domain/inspection/verify-symbolic-links/CONVENTIONS.md)) carry the endpoint-local mechanics.

---

## Non-Goals

- This convention does not add a privilege pre-check, a registry probe, or any elevation logic to the server.
- This convention does not model Git checkout concerns (`core.symlinks`, mode `120000`); those belong to the Git boundary, not to this server.
- This convention does not redefine the endpoint-local mechanics owned by the endpoint documentation triplets.
