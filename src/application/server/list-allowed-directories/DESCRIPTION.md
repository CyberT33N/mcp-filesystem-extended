# Description: `list_allowed_directories`
[INTENT: CONTEXT]

---

## 1. Scope Overview
[INTENT: CONTEXT]

`list_allowed_directories` is the application-owned server-scope endpoint that discloses which filesystem roots the running MCP server may access.

It exposes the effective `allowedDirectories` array from the server shell as a text-only response so callers can understand the active scope boundary before they invoke path-based inspection or mutation tools.

The endpoint is designed for:

- scope discovery before path-based operations,
- explaining the effective runtime boundary of the server,
- caller-visible clarification of allowed filesystem roots.

It is not a domain-owned inspection endpoint and not a filesystem mutation surface.

---

## 2. Architectural Register
[INTENT: REFERENCE]

| ID | Type | Description | Status |
| --- | --- | --- | --- |
| SRV-001 | REQUIREMENT | The endpoint remains application-owned because it describes server scope rather than domain behavior. | Active |
| SRV-002 | REQUIREMENT | The public result surface is a text-only list derived directly from `allowedDirectories`. | Active |
| SRV-003 | REQUIREMENT | The endpoint-local documentation triplet lives in a docs-only folder under `src/application/server/list-allowed-directories/`. | Active |
| SRV-004 | CONSTRAINT | The endpoint must not be documented as a domain-owned path-inspection or file-reading tool. | Active |
| SRV-005 | INFORMATION | The composition root and server shell remain the authoritative sources of the endpoint’s output semantics. | Active |
| SRV-006 | INFORMATION | The local documentation triplet is the endpoint-local SSOT that later root TOC surfaces should reference instead of duplicating. | Active |

---

## 3. Endpoint Architecture
[INTENT: SPECIFICATION]

### 3.1 Public request model

This endpoint takes no caller-supplied arguments.

Its contract is scope disclosure only.

### 3.2 Registration model

The tool is registered in [`register-server-scope-tools.ts`](../register-server-scope-tools.ts).

That registration:

1. exposes the public tool name `list_allowed_directories`,
2. describes the endpoint as a way to discover effective filesystem scope,
3. returns text content built directly from the `allowedDirectories` array in the registration context.

### 3.3 Server-shell ownership model

The authoritative source of the endpoint output is the application-owned server shell.

[`FilesystemServer`](../filesystem-server.ts) owns the effective allowed-directory scope and passes it into the registration context through the tool-catalog composition path.

### 3.4 Output surface

The endpoint returns a text block in the form:

- `Allowed directories:`
- one line per effective allowed root

This is a server-scope disclosure surface, not a structured domain result contract.

---

## 4. Ownership and Boundary Rationale
[INTENT: SPECIFICATION]

### 4.1 Why this endpoint lives in the application layer

This endpoint describes runtime server scope.

Because that concern belongs to the MCP shell and not to a filesystem behavior domain, the endpoint is application-owned.

### 4.2 Why the docs live in a docs-only folder

The endpoint has no dedicated domain code directory.

To preserve endpoint-local documentation SSOT without inventing a false domain boundary, the local documentation triplet lives in `src/application/server/list-allowed-directories/`.

### 4.3 Relationship to path-based tools

Path-based inspection and mutation tools remain bounded by the same `allowedDirectories` scope.

`list_allowed_directories` exists to expose that boundary explicitly to callers before those tools run.

---

## 5. Source-of-Truth Surfaces
[INTENT: REFERENCE]

| Surface | Role |
| --- | --- |
| [`register-server-scope-tools.ts`](../register-server-scope-tools.ts) | Public registration wording and text-output shape authority |
| [`filesystem-server.ts`](../filesystem-server.ts) | Server-shell ownership of the effective `allowedDirectories` scope |
| [`register-tool-catalog.ts`](../register-tool-catalog.ts) | Composition-root authority that wires the server-scope tool into the full catalog |

---

## 6. LLM Agent Guidance
[INTENT: CONTEXT]

Use `list_allowed_directories` when the caller needs to understand which filesystem roots the running server may access before issuing path-based calls.

Do not choose this endpoint when the real objective is:

- listing directory contents,
- reading file content,
- searching for paths,
- mutating filesystem state.

The endpoint-local conventions live in [`CONVENTIONS.md`](./CONVENTIONS.md), and the concise DX summary lives in [`README.md`](./README.md).
