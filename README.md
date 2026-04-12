# Filesystem MCP Server

TypeScript implementation of a local filesystem Model Context Protocol (MCP) server with a final target-state architecture split into `application`, `domain`, and `infrastructure` boundaries. The public MCP surface is composed once at the application layer, while tool behavior and contract ownership stay inside the domains that own them.

## Final Architecture at a Glance

| Layer | Responsibility | Representative files |
| --- | --- | --- |
| `application` | MCP server bootstrap, tool registration composition, MCP logging capability, server description/instructions, and server-scope concerns | `src/application/server/filesystem-server.ts`, `src/application/server/register-tool-catalog.ts`, `src/application/server/register-inspection-tool-catalog.ts`, `src/application/server/register-comparison-and-mutation-tool-catalog.ts`, `src/application/server/register-server-scope-tools.ts`, `src/application/server/tool-registration-presets.ts` |
| `domain` | Tool-owned handlers, input schemas, and structured result contracts for inspection, comparison, and mutation capabilities | `src/domain/inspection/*`, `src/domain/comparison/*`, `src/domain/mutation/*` |
| `infrastructure` | Technical capabilities that support the server without owning MCP transport or domain contracts | `src/infrastructure/filesystem/path-guard.ts`, `src/infrastructure/logging/logger.ts` |

## Public MCP Tool Surface

### Inspection domain
- `list_directory_entries`
- `read_files_with_line_numbers`
- `find_paths_by_name`
- `find_files_by_glob`
- `search_file_contents_by_regex`
- `count_lines`
- `get_path_metadata`
- `get_file_checksums`
- `verify_file_checksums`

### Comparison and mutation domains
- `diff_files`
- `diff_text_content`
- `create_files`
- `append_files`
- `replace_file_line_ranges`
- `create_directories`
- `copy_paths`
- `move_paths`
- `delete_paths`

### Application/server-scope tool
- `list_allowed_directories`

The public tool catalog is the final direct target-state surface. It is composed from bounded registration modules rather than from a monolithic flat registry.

## Composition Model

1. `FilesystemServer` creates the MCP server, enables logging capability, installs request handlers, and connects the stdio transport.
2. `registerToolCatalog` composes the public surface by delegating to:
   - `registerInspectionToolCatalog`
   - `registerComparisonAndMutationToolCatalog`
   - `registerServerScopeTools`
3. The application-layer `executeTool` wrapper centralizes call/result/error logging and normalizes plain-string results into MCP `content`.
4. `tool-registration-presets.ts` keeps annotation presets and optional task-support hints centralized so registration modules stay thin and consistent.
5. `server-description.ts` and `server-instructions.ts` define the stable initialization metadata exposed by the server shell.

## Why the Boundaries Look This Way

### Domain-Driven Design (DDD)
- Contract and schema ownership lives in the bounded context that owns the tool behavior.
- Inspection result schemas stay with inspection modules.
- Comparison and mutation behavior stays in their respective domains.
- The application layer composes these contracts into one MCP surface but does not re-declare them as a second source of truth.

### Enterprise-grade modularity
- Bounded registration modules reduce change blast radius.
- The composition root stays readable and easy to review.
- Tool families can evolve independently without reopening unrelated registration code.
- Shared registration presets eliminate repeated policy wiring and keep cross-cutting application concerns consistent.

### MCP server composition
- The application layer owns transport initialization, server identity, logging capability negotiation, and tool registration.
- Domain handlers provide behavior and structured results.
- Server instructions explicitly describe cross-tool rules such as array-based multi-target inputs, allowed-directory scoping, and authoritative structured output when present.

### 12-Factor alignment
- The server shell remains stateless with respect to business workflows.
- Runtime scope is configuration-driven through allowed-directory inputs rather than hard-coded workspace assumptions.
- Logging level is configuration-aware, while the MCP shell separately controls client-visible logging notifications.
- The delivery boundary can replace or recompose the server shell without rewriting domain logic.

## Runtime Invariants

- All path-based operations must remain inside configured allowed directories.
- `list_allowed_directories` stays application-owned because it describes server scope, not a domain filesystem capability.
- Domain modules remain the only canonical owners of tool behavior and contract definitions.
- Infrastructure modules keep technical concerns such as path guarding and canonical logging out of the application composition root.
- This documentation describes only the current final architecture and intentionally avoids legacy flat-structure or monolithic registration narratives.

## Traversal Hardening Model

The recursive inspection surface now follows one shared traversal policy that narrows broad-root requests before endpoint-specific traversal begins.

### Default excluded directory classes

When callers provide broad roots, traversal-oriented discovery and recursive inspection tools exclude vendor, cache, and generated directory classes by default. This keeps high-noise trees such as `node_modules`, package caches, build outputs, and coverage directories out of broad traversal passes unless the caller explicitly targets them.

### Explicit root access still works

The hardening model does not block intentional access to excluded trees. Callers can still provide explicit roots inside excluded directories, and those roots remain valid because the policy distinguishes between broad-root traversal and explicit path targeting.

### Additive re-includes stay narrow

`includeExcludedGlobs` reopens named descendants without widening the whole traversal request. This keeps the default exclusion baseline intact while still allowing focused access to known subtrees that matter for a specific workflow.

### `.gitignore` is secondary

Root-local `.gitignore` participation is optional and additive. The server-owned traversal policy remains the canonical default baseline, while `respectGitIgnore` can layer repository-local ignore rules on top when callers want additional narrowing.

### Traversal runtime budgets prevent unstable broad scans

Traversal runtime budgets cap visited entries, visited directories, and soft wall-clock time for traversal-heavy operations. These budgets exist to prevent oversized recursive scans from degrading response quality, consuming excessive runtime, or timing out before returning a stable result.

### Developer-facing rationale

This model exists to protect prompting efficiency and runtime stability without removing legitimate access paths. Broad-root requests stay safe by default, while explicit roots and additive re-include controls preserve deliberate access to excluded areas when callers truly need it.

## Key Source Areas

```text
src/
  application/server/
    filesystem-server.ts
    register-tool-catalog.ts
    register-inspection-tool-catalog.ts
    register-comparison-and-mutation-tool-catalog.ts
    register-server-scope-tools.ts
    tool-registration-presets.ts
    server-description.ts
    server-instructions.ts
  domain/
    inspection/
    comparison/
    mutation/
  infrastructure/
    filesystem/path-guard.ts
    logging/logger.ts
```

## Operational Summary

This repository now represents a modular MCP filesystem server whose layers are intentionally separated:

- `application` owns orchestration and exposure,
- `domain` owns tool behavior and contracts,
- `infrastructure` owns technical capabilities.

That separation is the final architectural source of truth for maintainers, users, and autonomous agents working in this workspace.
