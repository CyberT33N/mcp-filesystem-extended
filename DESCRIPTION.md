# Description: Filesystem MCP Server Workspace
[INTENT: CONTEXT]

---

## 1. Scope Overview
[INTENT: CONTEXT]

This document describes only the final target-state architecture of the workspace.
The workspace implements a local filesystem MCP server whose public tool surface is composed by the application layer, whose tool behavior and contracts are owned by domain modules, and whose reusable technical capabilities remain inside infrastructure boundaries.

---

## 2. Final Architecture Register
[INTENT: REFERENCE]

| ID | Type | Description | Status |
|----|------|-------------|--------|
| ARCH-001 | REQUIREMENT | The application layer owns MCP initialization, tool catalog composition, server description/instructions, and server-scope registration. | Active |
| ARCH-002 | REQUIREMENT | Domain modules own tool handlers, schemas, and structured result contracts for inspection, comparison, and mutation behavior. | Active |
| ARCH-003 | REQUIREMENT | `list_allowed_directories` remains a server-scope tool and is not moved into the filesystem behavior domains. | Active |
| ARCH-004 | CONSTRAINT | Infrastructure owns technical boundaries such as path guarding and canonical logging without becoming a second tool-contract surface. | Active |
| ARCH-005 | CONSTRAINT | Root documentation describes the final architecture only and does not retain flat per-tool or monolithic-registration narratives. | Active |
| ARCH-006 | INFORMATION | The final system is explained explicitly from DDD, enterprise-grade modularity, MCP composition, and 12-Factor viewpoints. | Active |

---

## 3. Information Units
[INTENT: SPECIFICATION]

### 3.1 ARCH-001: Application server shell and composition root
[INTENT: SPECIFICATION]

**Description:**
`src/application/server/` is the MCP-facing shell of the system. It owns server creation, lifecycle, transport connection, root logging capability handling, tool catalog composition, server description, and server instructions.

**Final State:**
- `filesystem-server.ts` creates `McpServer`, owns the allowed-directory scope, handles root log-level updates, and wraps tool execution for logging and result normalization.
- `register-tool-catalog.ts` is the thin composition root that delegates registration instead of containing one large inlined catalog.
- `register-inspection-tool-catalog.ts`, `register-comparison-and-mutation-tool-catalog.ts`, and `register-server-scope-tools.ts` expose bounded registration modules.
- `tool-registration-presets.ts` owns reusable annotation and execution presets shared across registration modules.
- `server-description.ts` and `server-instructions.ts` define the stable MCP initialization narrative.

**Architectural Implication:**
The application layer owns orchestration and exposure, not domain behavior. It composes the public tool surface from domain-owned contracts and server-owned concerns.

### 3.2 ARCH-002: Domain-owned behavior and contract surfaces
[INTENT: SPECIFICATION]

**Description:**
Domain modules own the behavior, schemas, and structured result contracts for the tool families they implement.

**Final State:**
- `src/domain/inspection/` owns inspection-oriented capabilities such as directory listing, direct file reading, metadata lookup, search, line counting, and checksum workflows.
- `src/domain/comparison/` owns diff-oriented capabilities.
- `src/domain/mutation/` owns additive, destructive, and targeted filesystem mutations such as create, append, copy, move, delete, directory creation, and line-range replacement.
- The application layer imports these domain surfaces and registers them without cloning or renaming them into a second contract catalog.

**Architectural Implication:**
Schema ownership follows behavior ownership. The domain layer is the single source of truth for tool-specific contracts.

### 3.3 ARCH-003: Server-scope boundary
[INTENT: SPECIFICATION]

**Description:**
Some capabilities describe the server execution boundary rather than filesystem business behavior.

**Final State:**
- `list_allowed_directories` is registered in `register-server-scope-tools.ts`.
- It remains application-owned because it describes runtime scope, not a domain filesystem operation.
- This keeps the domain families focused on real filesystem capabilities while the server shell owns process- and transport-facing scope metadata.

**Architectural Implication:**
Server identity and exposure concerns remain in the application shell instead of leaking into domain modules.

### 3.4 ARCH-004: Infrastructure technical boundary
[INTENT: SPECIFICATION]

**Description:**
Infrastructure holds technical capabilities required by the higher layers without taking ownership of the public MCP catalog or domain contracts.

**Final State:**
- `src/infrastructure/filesystem/path-guard.ts` is the canonical boundary for allowed-directory enforcement, path normalization, home expansion, symlink validation, and creation-path safety checks.
- `src/infrastructure/logging/logger.ts` is the canonical infrastructure logging surface through `initializeLogger()` and `createModuleLogger()`.
- The infrastructure layer remains technical and reusable; it does not become a second application composition layer or a second domain contract registry.

**Architectural Implication:**
Technical concerns stay isolated, which keeps transport orchestration out of infrastructure and tool semantics out of technical helpers.

### 3.5 ARCH-005: Final public tool surface
[INTENT: SPECIFICATION]

| Ownership | Public Tools |
|-----------|--------------|
| Inspection domain | `list_directory_entries`, `read_files_with_line_numbers`, `find_paths_by_name`, `find_files_by_glob`, `search_file_contents_by_regex`, `count_lines`, `get_path_metadata`, `get_file_checksums`, `verify_file_checksums` |
| Comparison and mutation domains | `diff_files`, `diff_text_content`, `create_files`, `append_files`, `replace_file_line_ranges`, `create_directories`, `copy_paths`, `move_paths`, `delete_paths` |
| Application/server scope | `list_allowed_directories` |

**Constraint:**
The documentation must describe this final catalog as the active surface and must not reintroduce obsolete flat per-tool or monolithic-registration narratives.

---

## 4. Architectural Perspectives
[INTENT: CONTEXT]

### 4.1 Domain-Driven Design (DDD)
- Bounded contexts own their contracts.
- The application layer coordinates exposure but does not become a second domain.
- Inspection, comparison, and mutation behaviors remain separated by responsibility.
- Server-scope concerns stay outside the behavior domains.

### 4.2 Enterprise-grade modularity
- Bounded registration modules reduce coupling and make review surfaces smaller.
- Shared presets keep policy wiring consistent across the catalog.
- The composition root is intentionally thin, making future change safer and easier to audit.
- The public surface remains cohesive even though internal ownership is modular.

### 4.3 MCP composition model
- `FilesystemServer` is the shell that exposes the MCP surface.
- Registration modules attach tools to the MCP server by ownership group.
- Domain handlers provide the operational behavior and structured results.
- The application shell wraps execution for call/result/error logging and client-facing MCP logging integration.

### 4.4 12-Factor positioning
- The server shell stays stateless regarding business workflow progress.
- Runtime scope is provided through allowed-directory configuration.
- Server behavior is composed from modules instead of a single monolithic registry body.
- Technical capabilities such as path guarding and logging remain replaceable boundaries behind stable layer ownership.

---

## 5. Path Index
[INTENT: REFERENCE]

| # | Path | Relevance |
|---|------|-----------|
| 1 | `src/application/server/filesystem-server.ts` | Application shell, MCP initialization, logging capability, execution wrapper |
| 2 | `src/application/server/register-tool-catalog.ts` | Thin composition root for the full tool catalog |
| 3 | `src/application/server/register-inspection-tool-catalog.ts` | Inspection registration boundary |
| 4 | `src/application/server/register-comparison-and-mutation-tool-catalog.ts` | Comparison/mutation registration boundary |
| 5 | `src/application/server/register-server-scope-tools.ts` | Server-scope registration boundary |
| 6 | `src/application/server/tool-registration-presets.ts` | Shared application annotation and execution presets |
| 7 | `src/application/server/server-description.ts` | Stable server description surface |
| 8 | `src/application/server/server-instructions.ts` | Stable server instruction surface |
| 9 | `src/infrastructure/filesystem/path-guard.ts` | Canonical path safety boundary |
| 10 | `src/infrastructure/logging/logger.ts` | Canonical infrastructure logging boundary |
| 11 | `PLAN.md` | Final migration summary and unit-level architecture contract |
| 12 | `.plan/1-domain-inspection/orchestration.md` | Inspection-domain ownership narrative |
| 13 | `.plan/2-domain-comparison-and-mutation/orchestration.md` | Comparison/mutation ownership narrative |
| 14 | `.plan/3-application-server/orchestration.md` | Application composition narrative |
| 15 | `.plan/4-infrastructure-and-delivery/orchestration.md` | Delivery-closeout narrative and remaining execution state |

---

## 6. Execution Context for LLM Agents
[INTENT: CONTEXT]

Treat this workspace as a final-state modular MCP filesystem server.
When describing or modifying the system:

- describe the current `application` / `domain` / `infrastructure` split,
- keep contract ownership with the domain that owns the behavior,
- keep server-scope concerns in the application shell,
- keep path guarding and logging in infrastructure boundaries,
- avoid reintroducing flat per-tool or monolithic registration narratives,
- avoid historical migration framing when describing the architecture.

This document is intentionally a final-state architectural reference for users, maintainers, and autonomous agents.
