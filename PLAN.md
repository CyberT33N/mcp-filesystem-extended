---
file_type: "master"
file_id: "filesystem-mcp-enterprise-runtime-and-documentation-plan"
plan_version: 1
created: "2026-04-18T00:00:00Z"
  last_updated: "2026-04-26T00:00:00Z"
    status: "in_progress"
  total_units: 11
    completed_units: 5
  total_tasks_all_levels: 38
    completed_tasks_all_levels: 27
hierarchy_depth: 2
max_hierarchy_depth: 4
plan_directory: ".plan/"
    resume_frontier_unit: "6"
    resume_frontier_task: "6.1"
    next_frontier_task: "6.2"
todo_window_default: "ACTIVE_PLUS_NEXT"
---

# HCOA Plan: Enterprise Runtime Refactors and Endpoint Documentation SSOT
[INTENT: CONTEXT]

This plan defines the next target-state architecture for the local filesystem MCP server after the earlier large-file search plan was implemented and moved into backup scope.

The new plan has five concurrent goals:

1. align binary/text/hybrid inspection handling to an enterprise-grade state model,
2. preserve the separate public read endpoints while converging their internal business logic onto a single shared core,
3. remove timeout-first behavior as the primary governor for valid broad inspection workloads and finish plus harden the calibrated preview/continuation runtime contract for the affected recursive inspection families,
4. introduce endpoint-local documentation SSOT surfaces for every public endpoint,
5. restructure root-level documentation into TOC-based root surfaces that re-reference endpoint-local documentation instead of duplicating it.

The backup plan at [`__bak__/plan-ugrep/PLAN.md`](__bak__/plan-ugrep/PLAN.md) remains a historical implementation reference only. It is not the authoritative target-state architecture for this plan. Its task files may be re-read only when the current implementation lineage, previously accepted guardrails, or migration decisions must be proven or contrasted.

---

## Navigation
[INTENT: REFERENCE]

- **Plan Directory:** `.plan/`
- **Total Units:** 11
- **Hierarchy Depth:** 2 levels
- **Overall Status:** in_progress
- **Progress:** 27/38 tasks completed
- **Historical Backup Plan:** [`__bak__/plan-ugrep/PLAN.md`](__bak__/plan-ugrep/PLAN.md)

## Execution Frontier
[INTENT: REFERENCE]

- **Resume Frontier Unit:** `6`
- **Resume Frontier Task:** `6.1`
- **Next Frontier Task:** `6.2`
- **Todo Window Default:** `ACTIVE_PLUS_NEXT`
- **Frontier Rule:** Units `1`, `2`, `3`, `4`, and `5` are fully complete. Unit `6` is now the active documentation frontier, and task `6.1` is the next operative endpoint-local documentation task.

## Units
[INTENT: REFERENCE]

- [x] **1. Runtime Architecture Refactors** → [`.plan/1-runtime-architecture-refactors/orchestration.md`](.plan/1-runtime-architecture-refactors/orchestration.md)
  - Classification: Mixed
  - Status: done | Tasks: 17 | Completed: 17
  - Summary: Introduce the shared inspection content-state model, hybrid-aware routing, internal read-core SSOT, traversal/preflight governance refactors, recalibrated admission thresholds, the same-endpoint continuation baseline, the caller-visible continuation-delivery and consumer-alignment hardening layers, the end-to-end `list_directory_entries` response-surfacing closure, and the final clean resume-session dual-delivery architecture with family-specific guidance and cursor hardening.
- [x] **2. Inspection Discovery Docs** → [`.plan/2-inspection-discovery-docs/orchestration.md`](.plan/2-inspection-discovery-docs/orchestration.md)
  - Classification: ISOLATED
  - Status: done | Tasks: 3 | Completed: 3
  - Summary: Create endpoint-local documentation sets for discovery-oriented inspection tools whose conventions depend on the final traversal model.
- [x] **3. Inspection Metadata and Integrity Docs** → [`.plan/3-inspection-metadata-and-integrity-docs/orchestration.md`](.plan/3-inspection-metadata-and-integrity-docs/orchestration.md)
  - Classification: Mixed
  - Status: done | Tasks: 3 | Completed: 3
  - Summary: Create endpoint-local documentation sets for metadata, checksum, and integrity-oriented inspection tools.
- [x] **4. Inspection Search and Count Docs** → [`.plan/4-inspection-search-and-count-docs/orchestration.md`](.plan/4-inspection-search-and-count-docs/orchestration.md)
  - Classification: Mixed
  - Status: done | Tasks: 3 | Completed: 3
  - Summary: Create endpoint-local documentation sets for regex search, fixed-string search, and count-lines after the runtime/search refactors land.
- [x] **5. Inspection Read Docs** → [`.plan/5-inspection-read-docs/orchestration.md`](.plan/5-inspection-read-docs/orchestration.md)
  - Classification: Mixed
  - Status: done | Tasks: 2 | Completed: 2
  - Summary: Create endpoint-local documentation sets for the two separate public read tools while documenting their intentionally distinct public roles and shared internal SSOT refactor.
- [ ] **6. Comparison Docs** → [`.plan/6-comparison-docs/orchestration.md`](.plan/6-comparison-docs/orchestration.md)
  - Classification: Mixed
  - Status: pending | Tasks: 2 | Completed: 0
  - Summary: Create endpoint-local documentation sets for the comparison-domain tool surfaces.
- [ ] **7. Content Mutation Docs** → [`.plan/7-content-mutation-docs/orchestration.md`](.plan/7-content-mutation-docs/orchestration.md)
  - Classification: Mixed
  - Status: pending | Tasks: 3 | Completed: 0
  - Summary: Create endpoint-local documentation sets for content-bearing mutation endpoints.
- [ ] **8. Path Mutation Docs** → [`.plan/8-path-mutation-docs/orchestration.md`](.plan/8-path-mutation-docs/orchestration.md)
  - Classification: Mixed
  - Status: pending | Tasks: 4 | Completed: 0
  - Summary: Create endpoint-local documentation sets for path-oriented mutation endpoints.
- [ ] **9. Server-Scope Docs** → [`.plan/9-server-scope-docs/orchestration.md`](.plan/9-server-scope-docs/orchestration.md)
  - Classification: Mixed
  - Status: pending | Tasks: 1 | Completed: 0
  - Summary: Create the endpoint-local documentation set for the application-owned `list_allowed_directories` tool.
- [ ] **10. Root Documentation SSOT** → [`.plan/10-root-documentation-ssot/orchestration.md`](.plan/10-root-documentation-ssot/orchestration.md)
  - Classification: Mixed
  - Status: pending | Tasks: 3 | Completed: 0
  - Summary: Introduce root-level TOC and SSOT documentation surfaces that point to endpoint-local documentation instead of duplicating it.
- [ ] **11. Cross-Cutting Validation and Backup Policy** → [`.plan/11-cross-cutting-validation-and-backup-policy/orchestration.md`](.plan/11-cross-cutting-validation-and-backup-policy/orchestration.md)
  - Classification: WAITING
  - Status: pending | Tasks: 3 | Completed: 0
  - Summary: Align caller-facing code contracts, enforce the backup-reference policy, and execute the final architecture/doc-link validation sweep.

## Cross-Unit Dependencies
[INTENT: REFERENCE]

| ID | Source | Target | Type | Status | Description | Shared Files |
|----|--------|--------|------|--------|-------------|--------------|
| D1 | 2.1-2.3 | 1.12 | WAITING | RESOLVED | Discovery-endpoint documentation must now re-anchor to the final resume-session dual-delivery and endpoint-guidance architecture from task `1.12`, including `list_directory_entries`, `find_files_by_glob`, and `find_paths_by_name` scope-reduction guidance plus dual preview-family resume intents. | `src/domain/shared/resume/**`, `src/infrastructure/persistence/**`, `src/domain/inspection/list-directory-entries/**`, `src/domain/inspection/find-files-by-glob/**`, `src/domain/inspection/find-paths-by-name/**`, `src/application/server/register-inspection-tool-catalog.ts`, `src/application/server/server-instructions.ts` |
| D2 | 4.1-4.3 | 1.12 | WAITING | RESOLVED | Search/count documentation must now re-anchor to the final resume-session and endpoint-guidance architecture from task `1.12`, including dual preview-family delivery for regex/fixed-string and the completion-backed-only contract for `count_lines`. | `src/domain/shared/resume/**`, `src/infrastructure/persistence/**`, `src/domain/inspection/search-file-contents-by-regex/**`, `src/domain/inspection/search-file-contents-by-fixed-string/**`, `src/domain/inspection/count-lines/**`, `src/application/server/register-inspection-tool-catalog.ts`, `src/application/server/server-instructions.ts` |
| D3 | 5.1-5.2 | 1.4 | WAITING | RESOLVED | Read-endpoint documentation now re-anchors the finalized public split and internal shared read-core refactor from completed unit 1. | `src/domain/inspection/read-file-content/**`, `src/domain/inspection/read-files-with-line-numbers/**` |
| D4 | 10.1 | 2.1 | WAITING | RESOLVED | Root conventions cannot become the SSOT TOC until endpoint-local conventions exist. | `CONVENTIONS.md` |
| D5 | 10.2 | 2.1 | WAITING | RESOLVED | Root description cannot become the SSOT TOC until endpoint-local descriptions exist. | `DESCRIPTION.md` |
| D6 | 10.3 | 2.1 | WAITING | RESOLVED | Root README cannot become the DX TOC until endpoint-local READMEs exist. | `README.md` |
| D7 | 11.1 | 1.12 | WAITING | RESOLVED | Public tool descriptions and server instructions that cover resume behavior must now align to the final clean resume-session architecture from task `1.12`, including scope-reduction guidance, dual preview-family resume intents, and completion-backed `count_lines` semantics. | `src/application/server/register-inspection-tool-catalog.ts`, `src/application/server/server-instructions.ts`, `src/application/server/filesystem-server.ts`, `src/domain/shared/resume/**`, `src/domain/inspection/list-directory-entries/**`, `src/domain/inspection/find-files-by-glob/**`, `src/domain/inspection/find-paths-by-name/**`, `src/domain/inspection/search-file-contents-by-regex/**`, `src/domain/inspection/search-file-contents-by-fixed-string/**`, `src/domain/inspection/count-lines/**` |
| D8 | 11.2 | 10.3 | WAITING | UNRESOLVED | The backup-reference policy and root-to-endpoint link audit require the completed root TOC surfaces. | `README.md`, `DESCRIPTION.md`, `CONVENTIONS.md` |
| D9 | 11.3 | 11.2 | WAITING | UNRESOLVED | Final architecture validation runs only after code-contract alignment and link-policy validation complete. | `PLAN.md`, `.plan/**`, root docs, endpoint docs |

## Legend
[INTENT: REFERENCE]

### Task States

| State | Symbol | Description | Can Transition To |
|-------|--------|-------------|-------------------|
| PENDING | [ ] | Not started | IN_PROGRESS, BLOCKED |
| IN_PROGRESS | [~] | Being worked on | DONE, BLOCKED |
| BLOCKED | [!] | Local dependency unresolved | PENDING |
| WAITING | [W] | Cross-unit dependency unresolved | PENDING |
| DONE | [x] | Completed | VERIFIED |
| VERIFIED | [x] | Cross-verified | — |

### Task Classification

| Classification | Description | Parallel | Sub-Agent |
|----------------|-------------|----------|-----------|
| ISOLATED | No dependencies | YES | YES |
| SEQUENTIAL | Ordered inside the same unit | NO | After predecessor |
| DEPENDENT | Shared-file or sibling ordering dependency | CONDITIONAL | After dependency resolves |
| WAITING | Cross-unit blocker exists | NO | After blocker resolves |

### Dependency Types

| Type | Description | Resolution |
|------|-------------|------------|
| WAITING | The target task or unit must complete first | Auto-unblock when target is DONE |
| SEQUENTIAL | Ordered sibling execution | Auto-unblock when predecessor is DONE |
| SHARED_FILE | Same file surface is modified by more than one task | Strict sequential execution with re-anchoring |

## Notes for Orchestrating Agent
[INTENT: CONSTRAINT]

- Preserve the public endpoint split between [`read_files_with_line_numbers`](src/application/server/register-inspection-tool-catalog.ts:102) and [`read_file_content`](src/application/server/register-inspection-tool-catalog.ts:117) while refactoring only the internal shared business logic.
- Do not treat task [`1.5-traversal-preflight-and-runtime-budget-refactor.md`](.plan/1-runtime-architecture-refactors/1.5-traversal-preflight-and-runtime-budget-refactor.md) as the final traversal authority; task `1.6` closes the shared admission planner, task `1.7` recalibrates the admission values, tasks `1.8` through `1.11` land the current same-endpoint continuation baseline and real-client surfacing closures, and task `1.12` then supersedes the public continuation vocabulary with the final clean resume-session dual-delivery and endpoint-guidance architecture.
- Treat [`__bak__/plan-ugrep/PLAN.md`](__bak__/plan-ugrep/PLAN.md) and its child task files as historical implementation references only; they are never the authoritative target-state contract for this plan.
- Use builtin `node:sqlite` for the local resume-session store; do not introduce a second public resume endpoint, a second primary public token, or an external database dependency for that runtime layer.
- Do not solve the resume-session remodel by raising family response caps or weakening the global response fuse; the target fix is clean session semantics, server-owned completion intent, explicit scope-reduction guidance, and family-wide frontier hardening with unchanged cap ownership.
- When a preview-family response is no longer resumable, the caller-visible response must fall back to the bounded final result surface rather than remaining in dead-end preview guidance mode.
- Root documentation must become TOC-style and SSOT-aligned; endpoint-local `CONVENTIONS.md`, `DESCRIPTION.md`, and `README.md` files own endpoint-specific detail, including the family-specific guidance introduced by task `1.12`.
- Every public endpoint must receive its own documentation triplet; no endpoint-local conventions may be documented only at root level.

