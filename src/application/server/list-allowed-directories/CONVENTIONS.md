# Conventions: `list_allowed_directories`
[INTENT: CONSTRAINT]

---

## 1. Local SSOT Role
[INTENT: CONTEXT]

This file is the endpoint-local single source of truth for the `list_allowed_directories` conventions and guardrails.

It owns the rules for:

- application-owned server-scope classification,
- docs-only endpoint-folder placement,
- text-only scope disclosure semantics,
- separation from domain-owned inspection behavior,
- root-TOC re-reference expectations for later documentation phases.

The endpoint-local architecture description lives in [`DESCRIPTION.md`](./DESCRIPTION.md), and the concise developer-facing summary lives in [`README.md`](./README.md).

This endpoint also follows the global public-limit-disclosure policy in [`public-limit-disclosure-governance.md`](../../../../conventions/guardrails/public-limit-disclosure-governance.md).

---

## 2. Canonical Request Surface
[INTENT: REFERENCE]

| Surface | Rule |
| --- | --- |
| Tool name | `list_allowed_directories` |
| Input arguments | none |
| Output shape | text-only list built from the effective `allowedDirectories` scope |
| Ownership model | application-owned server-scope surface |
| Mutation behavior | none |

### Canonical same-concept rule
[INTENT: CONSTRAINT]

The public contract is scope disclosure for the MCP server shell.

Do not rename or reframe this same-concept surface as:

- a domain-owned filesystem inspection endpoint,
- a path search surface,
- a metadata lookup surface,
- a content-reading or mutation surface.

---

## 3. Server-Scope Semantics
[INTENT: CONSTRAINT]

### 3.1 Application-owned scope disclosure

`list_allowed_directories` is application-owned because it describes the effective filesystem scope of the running MCP server.

It does not own filesystem business behavior.

### 3.2 Docs-only folder placement

This tool has no dedicated domain code directory.

Its endpoint-local documentation therefore lives in the docs-only folder `src/application/server/list-allowed-directories/`.

### 3.3 Text-only output model

The registration surface returns plain text built directly from the current `allowedDirectories` array.

There is no domain handler/schema pair and no endpoint-local request payload to describe.

### 3.4 Scope-before-action guidance

Use this endpoint when the caller needs to understand the effective allowed-directory roots before issuing path-based calls.

---

## 3A. Public Limit Disclosure Placement
[INTENT: CONSTRAINT]

`list_allowed_directories` follows the global public-limit-disclosure policy with a server-scope-specific non-prioritization rule.

### 3A.1 No parameter-description disclosure surface

This endpoint has no caller-supplied request payload.

There is therefore no parameter-level limit-disclosure surface to populate.

### 3A.2 Tool-description disclosure rule

The public tool description should explain only that this endpoint is a compact text-only scope-disclosure surface for the effective `allowedDirectories` boundary.

It should not be overloaded with numeric contract limits that do not materially change caller tool selection or argument construction.

### 3A.3 Non-prioritized internal limits

This endpoint must not promote the following shared internal or broader server-owned limits into its routine public tool description as if they were primary caller targets:

- the exact global response fuse,
- traversal emergency-runtime ceilings,
- response-family budgeting heuristics from content-heavy endpoint families.

Those surfaces remain owned by shared architecture conventions because they are server-internal protection mechanics rather than the primary caller-actionable contract for this endpoint.

---

## 4. Guardrails and Boundary Rules
[INTENT: CONSTRAINT]

### 4.1 No content or path introspection beyond scope disclosure

This endpoint reports configured scope only.

It does not inspect file contents, enumerate nested directory entries, or mutate any filesystem surface.

### 4.2 Distinction from inspection tools

Inspection tools operate on caller-selected roots, files, or content surfaces.

`list_allowed_directories` instead reports the server-owned boundary that constrains those tools.

### 4.3 Distinction from mutation tools

Mutation tools create, replace, move, copy, append, or delete filesystem surfaces.

`list_allowed_directories` performs no filesystem mutation at all.

---

## 5. Practical Use Guidance
[INTENT: CONSTRAINT]

Use this endpoint when the caller needs to:

- confirm which directory roots the server may access,
- understand why later path-based operations may be accepted or refused,
- inspect server scope before broader path-oriented work begins.

Choose another tool when the real objective is:

- listing directory contents,
- reading files,
- locating paths by name or glob,
- mutating filesystem state.
