# Description: Filesystem MCP Server Architecture Index
[INTENT: CONTEXT]

---

## 1. Document Scope
[INTENT: CONTEXT]

This root document is the final-state architecture index for the workspace.

It keeps only cross-endpoint, workspace-level architecture and routes detailed endpoint-specific architecture to endpoint-local `DESCRIPTION.md` files. It does not act as a second monolithic endpoint book.

---

## 2. Shared Target-State Architecture
[INTENT: SPECIFICATION]

| Layer | Owns | Representative surfaces |
|---|---|---|
| Application | MCP server bootstrap, tool-catalog composition, stable public framing, and server-scope exposure | [`filesystem-server.ts`](src/application/server/filesystem-server.ts), [`register-tool-catalog.ts`](src/application/server/register-tool-catalog.ts), [`register-inspection-tool-catalog.ts`](src/application/server/register-inspection-tool-catalog.ts), [`register-comparison-and-mutation-tool-catalog.ts`](src/application/server/register-comparison-and-mutation-tool-catalog.ts), [`register-server-scope-tools.ts`](src/application/server/register-server-scope-tools.ts), [`server-description.ts`](src/application/server/server-description.ts), [`server-instructions.ts`](src/application/server/server-instructions.ts) |
| Domain | Public tool behavior, input schemas, structured results, and family-local runtime semantics | [`inspection`](src/domain/inspection), [`comparison`](src/domain/comparison), [`mutation`](src/domain/mutation) |
| Infrastructure | Technical boundaries reused by higher layers without becoming a second public tool-contract surface | [`filesystem`](src/infrastructure/filesystem), [`logging`](src/infrastructure/logging), [`persistence`](src/infrastructure/persistence) |

Shared ownership boundaries that remain true across the workspace:

- `list_allowed_directories` stays application-owned because it describes server scope, not filesystem business behavior.
- Inspection, comparison, and mutation families keep contract ownership inside the domain that owns the behavior.
- Infrastructure stays technical; it does not become a second application composition root or a second domain catalog.

---

## 3. Cross-Cutting Architecture TOC
[INTENT: REFERENCE]

| Concern | Root SSOT surface | Why it stays centralized |
|---|---|---|
| Guardrail layers and response budgets | [`CONVENTIONS.md`](CONVENTIONS.md) plus [`conventions/guardrails/overview.md`](conventions/guardrails/overview.md) | Cross-endpoint safety policy |
| Structured response authority | [`structured-content-contract.md`](conventions/mcp-response-contract/structured-content-contract.md) | Primary-result authority of `content.text` and machine-readable envelope ownership |
| Resume architecture | [`conventions/resume-architecture/overview.md`](conventions/resume-architecture/overview.md) | Same-endpoint resume, additive completion, and continuation-envelope rules |
| Content classification | [`conventions/content-classification/overview.md`](conventions/content-classification/overview.md) | Shared text/binary/hybrid eligibility and sampling contract |
| Search platform | [`conventions/search-platform/overview.md`](conventions/search-platform/overview.md) | Explicit-file versus recursive search lanes and search-family governance |
| Read-surface split | [`CONVENTIONS.md`](CONVENTIONS.md) plus endpoint-local read descriptions | Public split between `read_files_with_line_numbers` and `read_file_content`, shared internal read-core SSOT |

---

## 4. Endpoint-Local Architecture Index
[INTENT: REFERENCE]

### 4.1 Inspection — discovery

| Endpoint | Local architecture description |
|---|---|
| `list_directory_entries` | [`DESCRIPTION.md`](src/domain/inspection/list-directory-entries/DESCRIPTION.md) |
| `find_paths_by_name` | [`DESCRIPTION.md`](src/domain/inspection/find-paths-by-name/DESCRIPTION.md) |
| `find_files_by_glob` | [`DESCRIPTION.md`](src/domain/inspection/find-files-by-glob/DESCRIPTION.md) |

### 4.2 Inspection — metadata and integrity

| Endpoint | Local architecture description |
|---|---|
| `get_path_metadata` | [`DESCRIPTION.md`](src/domain/inspection/get-path-metadata/DESCRIPTION.md) |
| `get_file_checksums` | [`DESCRIPTION.md`](src/domain/inspection/get-file-checksums/DESCRIPTION.md) |
| `verify_file_checksums` | [`DESCRIPTION.md`](src/domain/inspection/verify-file-checksums/DESCRIPTION.md) |

### 4.3 Inspection — search and count

| Endpoint | Local architecture description |
|---|---|
| `search_file_contents_by_regex` | [`DESCRIPTION.md`](src/domain/inspection/search-file-contents-by-regex/DESCRIPTION.md) |
| `search_file_contents_by_fixed_string` | [`DESCRIPTION.md`](src/domain/inspection/search-file-contents-by-fixed-string/DESCRIPTION.md) |
| `count_lines` | [`DESCRIPTION.md`](src/domain/inspection/count-lines/DESCRIPTION.md) |

### 4.4 Inspection — read

| Endpoint | Local architecture description |
|---|---|
| `read_files_with_line_numbers` | [`DESCRIPTION.md`](src/domain/inspection/read-files-with-line-numbers/DESCRIPTION.md) |
| `read_file_content` | [`DESCRIPTION.md`](src/domain/inspection/read-file-content/DESCRIPTION.md) |

### 4.5 Comparison

| Endpoint | Local architecture description |
|---|---|
| `diff_files` | [`DESCRIPTION.md`](src/domain/comparison/diff-files/DESCRIPTION.md) |
| `diff_text_content` | [`DESCRIPTION.md`](src/domain/comparison/diff-text-content/DESCRIPTION.md) |

### 4.6 Mutation — content

| Endpoint | Local architecture description |
|---|---|
| `create_files` | [`DESCRIPTION.md`](src/domain/mutation/create-files/DESCRIPTION.md) |
| `append_files` | [`DESCRIPTION.md`](src/domain/mutation/append-files/DESCRIPTION.md) |
| `replace_file_line_ranges` | [`DESCRIPTION.md`](src/domain/mutation/replace-file-line-ranges/DESCRIPTION.md) |

### 4.7 Mutation — path

| Endpoint | Local architecture description |
|---|---|
| `create_directories` | [`DESCRIPTION.md`](src/domain/mutation/create-directories/DESCRIPTION.md) |
| `copy_paths` | [`DESCRIPTION.md`](src/domain/mutation/copy-paths/DESCRIPTION.md) |
| `move_paths` | [`DESCRIPTION.md`](src/domain/mutation/move-paths/DESCRIPTION.md) |
| `delete_paths` | [`DESCRIPTION.md`](src/domain/mutation/delete-paths/DESCRIPTION.md) |

### 4.8 Application/server scope

| Endpoint | Local architecture description |
|---|---|
| `list_allowed_directories` | [`DESCRIPTION.md`](src/application/server/list-allowed-directories/DESCRIPTION.md) |

---

## 5. Root-Level Documentation Ownership
[INTENT: SPECIFICATION]

| Surface | Owns |
|---|---|
| `CONVENTIONS.md` | Shared project-wide documentation policy, root TOC routing, and cross-endpoint conventions |
| `DESCRIPTION.md` | Shared architecture scope and routing into endpoint-local architecture descriptions |
| `README.md` | DX-first orientation and routing into endpoint-local developer summaries |
| Endpoint-local `DESCRIPTION.md` files | Detailed per-endpoint architecture, runtime semantics, and boundary rationale |

The root description therefore stays final-state-only and endpoint-overlapping. Detailed per-endpoint architecture is intentionally pushed down into the local SSOT surfaces above.

---

## 6. Stable Public Framing Surfaces
[INTENT: REFERENCE]

| Surface | Role |
|---|---|
| [`server-description.ts`](src/application/server/server-description.ts) | Stable server-level summary exposed during MCP initialization |
| [`server-instructions.ts`](src/application/server/server-instructions.ts) | Stable caller-visible rules for path scope, resume, guardrails, and structured-envelope behavior |

---

## 7. Guidance for Maintainers and LLM Agents
[INTENT: CONTEXT]

When describing or modifying the system:

- start with this root file for shared architecture only,
- use `CONVENTIONS.md` for cross-endpoint rules and leaf-slice routing,
- descend into the endpoint-local `DESCRIPTION.md` for tool-specific architecture,
- keep endpoint detail out of the root layer unless it is truly cross-endpoint,
- describe only the current final target state, not historical migration narration.

This file is intentionally the workspace-level architecture index, not the endpoint-local source of truth.
