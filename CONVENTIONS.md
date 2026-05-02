# MCP Filesystem Extended — Architecture Conventions

This document is the entry point for the architecture conventions of this project. Each linked document covers one specific architectural concern. All implementation decisions that are non-obvious from local code context are documented here so that both autonomous LLM agents and human engineers can reason correctly about the design without re-deriving it from source.

---

## Table of Contents
 
| Document | Covers |
|---|---|
| [Guardrails Overview](conventions/guardrails/overview.md) | All guardrail layers, their placement, limits, and scope |
| [MCP Client Governance](conventions/guardrails/mcp-client-governance.md) | L1/L2 defense-in-depth model, response-family ceiling rationale with full limit inventory, and chunk-read governance contract |
| [Resume Architecture Overview](conventions/resume-architecture/overview.md) | Resume-session model, delivery modes, endpoint families, and scope reduction |
| [Resume Architecture Workflow](conventions/resume-architecture/workflow.md) | Step-by-step execution flow for each delivery mode |
| [Guardrail–Resume Interaction](conventions/resume-architecture/guardrail-interaction.md) | Which guardrails apply in which mode, the mode-aware cap rule, and the global fuse as the non-bypassable floor |
| [Resume Endpoint Schema Contract](conventions/resume-architecture/endpoint-schema-contract.md) | MCP SDK flat-schema constraint, required `superRefine` pattern, sentinel-check discipline, shared field builders, and affected endpoint list |
| [Content Classification Overview](conventions/content-classification/overview.md) | Classifier states, decision tree, sampling strategy, endpoint integration, and invariants |
| [Content Inspection Capability Matrix](conventions/content-classification/operation-capability-matrix.md) | Content-inspecting endpoint list, shared capability matrix, encoding-aware hybrid policy, and discovery-family exclusion |
| [Schema Optionality Contract](conventions/content-classification/schema-optionality-contract.md) | Why optional string query fields must not carry `.default("")`, sentinel-check detection, and correct modeling |
| [Structured Content Contract](conventions/mcp-response-contract/structured-content-contract.md) | Primary-result authority of `content.text`, additive structured mirroring, and continuation-guidance placement |
| [Search Platform Overview](conventions/search-platform/overview.md) | Ugrep search architecture, endpoint-family search roles, explicit-file versus recursive lane model, and search/read/count boundaries |
| [Search Platform Endpoint Lane Matrix](conventions/search-platform/endpoint-family-lane-matrix.md) | Complete affected endpoint matrix, lane capabilities, resume modes, refusal surfaces, and supported large-file behaviors |
| [Search Platform Preflight and Hardgap Governance](conventions/search-platform/preflight-and-hardgap-governance.md) | Correct preflight ownership, recursive admission lanes, explicit-file search entry rules, and hardgap boundaries |
| [Search Platform Threshold and Variable Registry](conventions/search-platform/threshold-and-variable-registry.md) | Canonical search-platform variables, family thresholds, hardgaps, sync caps, response caps, and their intended ownership |

---

## Endpoint-Local Conventions Index

This root conventions file routes both shared convention leaveslices under [`conventions/`](conventions/) and endpoint-local [`CONVENTIONS.md`](src/domain/inspection/list-directory-entries/CONVENTIONS.md) surfaces.

Shared cross-endpoint policy stays in the linked convention leaveslices above.
Endpoint-specific policy stays in the linked endpoint-local convention files below.

### Application/server scope

- [`list_allowed_directories`](src/application/server/list-allowed-directories/CONVENTIONS.md)

### Inspection — discovery

- [`list_directory_entries`](src/domain/inspection/list-directory-entries/CONVENTIONS.md)
- [`find_paths_by_name`](src/domain/inspection/find-paths-by-name/CONVENTIONS.md)
- [`find_files_by_glob`](src/domain/inspection/find-files-by-glob/CONVENTIONS.md)

### Inspection — metadata and integrity

- [`get_path_metadata`](src/domain/inspection/get-path-metadata/CONVENTIONS.md)
- [`get_file_checksums`](src/domain/inspection/get-file-checksums/CONVENTIONS.md)
- [`verify_file_checksums`](src/domain/inspection/verify-file-checksums/CONVENTIONS.md)

### Inspection — search and count

- [`search_file_contents_by_regex`](src/domain/inspection/search-file-contents-by-regex/CONVENTIONS.md)
- [`search_file_contents_by_fixed_string`](src/domain/inspection/search-file-contents-by-fixed-string/CONVENTIONS.md)
- [`count_lines`](src/domain/inspection/count-lines/CONVENTIONS.md)

### Inspection — read

- [`read_files_with_line_numbers`](src/domain/inspection/read-files-with-line-numbers/CONVENTIONS.md)
- [`read_file_content`](src/domain/inspection/read-file-content/CONVENTIONS.md)

### Comparison

- [`diff_files`](src/domain/comparison/diff-files/CONVENTIONS.md)
- [`diff_text_content`](src/domain/comparison/diff-text-content/CONVENTIONS.md)

### Mutation — content

- [`create_files`](src/domain/mutation/create-files/CONVENTIONS.md)
- [`append_files`](src/domain/mutation/append-files/CONVENTIONS.md)
- [`replace_file_line_ranges`](src/domain/mutation/replace-file-line-ranges/CONVENTIONS.md)

### Mutation — path

- [`create_directories`](src/domain/mutation/create-directories/CONVENTIONS.md)
- [`copy_paths`](src/domain/mutation/copy-paths/CONVENTIONS.md)
- [`move_paths`](src/domain/mutation/move-paths/CONVENTIONS.md)
- [`delete_paths`](src/domain/mutation/delete-paths/CONVENTIONS.md)

## Core Invariants

The following rules are non-negotiable across the entire codebase:

1. **The global response fuse is always active.** `GLOBAL_RESPONSE_HARD_CAP_CHARS = 600,000` in the server shell (`src/application/server/filesystem-server.ts`) is the last, non-bypassable safety ceiling for every MCP tool response across all delivery modes.

2. **Family-level response caps apply only in inline and `next-chunk` delivery modes.** They must not block responses in `complete-result` mode. The global fuse is the ceiling for `complete-result` responses.

3. **Admission-layer timeouts and budgets are routing logic, not blocking guards for `complete-result`.** They remain active and correct for all modes because they determine which delivery lane is needed. They do not block `complete-result` execution.

4. **`count_lines` is completion-backed only.** It never exposes preview-style partial totals and never supports `resumeMode = 'next-chunk'`.

5. **Resume is same-endpoint and token-only.** No second public endpoint, no query resend on resume-only requests.

6. **Scope reduction is always a first-class alternative.** Every affected endpoint family must surface scope reduction guidance alongside resume guidance.

7. **`complete-result` responses are additive, not redundant.** When a caller resumes a preview-first session with `resumeMode = 'complete-result'`, the server continues traversal from the persisted frontier position and returns only entries not already delivered in the prior preview chunk. The `admission.guidanceText` field in every `complete-result` response must be a machine-readable statement that the caller must combine both payloads for the complete dataset.

8. **`content.text` remains the complete primary result surface.** When a tool emits `structuredContent`, caller-visible primary result data must still remain complete in `content.text`; `structuredContent` mirrors that data additively, while `structuredContent.admission` and `structuredContent.resume` remain the authoritative machine-readable envelope fields.
