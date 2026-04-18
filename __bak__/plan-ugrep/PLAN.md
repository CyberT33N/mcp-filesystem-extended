---
file_type: "master"
file_id: "workspace-search-platform-hcoa-plan"
plan_version: 1
created: "2026-04-16T21:30:00Z"
last_updated: "2026-04-16T21:30:00Z"
status: "done"
total_units: 5
completed_units: 5
total_tasks_all_levels: 8
 completed_tasks_all_levels: 8
hierarchy_depth: 2
max_hierarchy_depth: 4
plan_directory: ".plan/"
resume_frontier_unit: "5"
 resume_frontier_task: "5.2"
 next_frontier_task: "5.2"
todo_window_default: "ACTIVE_PLUS_NEXT"
---

# HCOA Plan: Large-File Search, Read, and Count Architecture
[INTENT: CONTEXT]

This plan implements the agreed target architecture for large-file-safe search, bounded and streaming content reads, count-lines modernization, runtime I/O capability governance, and the required contract, guardrail, TSDoc, and validation work.

The plan preserves the existing public regex endpoint surface while replacing its internal search engine, adds one new fixed-string search endpoint, adds one new content-read endpoint, keeps the metadata/traversal/checksum family on the existing filesystem-native architecture, and brings `count_lines` into the same large-text execution model where appropriate.

---

## Navigation
[INTENT: REFERENZ]

- **Plan Directory:** `.plan/`
- **Total Units:** 5
- **Hierarchy Depth:** 2 levels
- **Overall Status:** done
- **Progress:** 8/8 tasks completed

## Execution Frontier
[INTENT: REFERENZ]

- **Resume Frontier Unit:** `5`
- **Resume Frontier Task:** `5.2`
- **Next Frontier Task:** `5.2`
- **Todo Window Default:** `ACTIVE_PLUS_NEXT`
- **Frontier Rule:** The execution entrypoint starts with runtime governance foundations and only advances to endpoint implementation after the shared execution policy is bound.

## Units
[INTENT: REFERENZ]

- [x] **1. Runtime Governance Foundations** → [`.plan/1-runtime-governance/orchestration.md`](.plan/1-runtime-governance/orchestration.md)
  - Classification: Mixed
  - Status: done | Tasks: 1 | Completed: 1
  - Summary: Establish the reusable runtime capability profile and the execution policy thresholds that all large-text workloads must consume.
- [x] **2. Search Platform Refactoring** → [`.plan/2-search-platform/orchestration.md`](.plan/2-search-platform/orchestration.md)
  - Classification: Mixed
  - Status: done | Tasks: 3 | Completed: 3
  - Summary: Centralize search on the shared `ugrep` adapter, preserve the public regex endpoint, and add the new fixed-string endpoint.
- [x] **3. Read Content Architecture** → [`.plan/3-read-content/orchestration.md`](.plan/3-read-content/orchestration.md)
  - Classification: WAITING
  - Status: done | Tasks: 1 | Completed: 1
  - Summary: Add the new `read_file_content` endpoint with bounded full-read, line-range, byte-range, and cursor-based streaming modes.
- [x] **4. Count-Lines Modernization** → [`.plan/4-count-lines/orchestration.md`](.plan/4-count-lines/orchestration.md)
  - Classification: WAITING
  - Status: done | Tasks: 1 | Completed: 1
  - Summary: Extend `count_lines` to support large-file-safe total and pattern-aware counting without full in-process reads.
- [x] **5. Contracts, Validation, and Documentation** → [`.plan/5-contracts-and-validation/orchestration.md`](.plan/5-contracts-and-validation/orchestration.md)
  - Classification: Mixed
  - Status: done | Tasks: 2 | Completed: 2
  - Summary: Harmonize shared guardrail constants and public server descriptions, then add tests, regression coverage, and architecture-grade TSDocs.

## Cross-Unit Dependencies
[INTENT: REFERENZ]

| ID | Source | Target | Type | Status | Description | Shared Files |
|----|--------|--------|------|--------|-------------|--------------|
| D1 | 2.2 | 1.1 | WAITING | RESOLVED | The regex endpoint refactor needs the runtime capability profile and execution thresholds before binding the new execution lane. | `none` |
| D2 | 3.1 | 1.1 | WAITING | RESOLVED | The new read endpoint must consume the same runtime capability profile and tier semantics. | `none` |
| D3 | 4.1 | 1.1 | WAITING | RESOLVED | Large-file count-lines behavior must reuse the same I/O capability and execution-threshold vocabulary. | `none` |
| D4 | 4.1 | 2.1 | WAITING | RESOLVED | Pattern-based counting depends on the shared native-search adapter contract. | `none` |
| D5 | 5.1 | 2.2 | WAITING | RESOLVED | Shared descriptions and guardrail registry changes must reflect the final regex endpoint behavior. | `src/application/server/register-inspection-tool-catalog.ts` |
| D6 | 5.1 | 2.3 | WAITING | RESOLVED | Shared descriptions and guardrail registry changes must reflect the new fixed-string endpoint. | `src/application/server/register-inspection-tool-catalog.ts` |
| D7 | 5.1 | 3.1 | WAITING | RESOLVED | Shared descriptions and guardrail registry changes must reflect the new content-read endpoint contract. | `src/application/server/register-inspection-tool-catalog.ts` |
| D8 | 5.1 | 4.1 | WAITING | RESOLVED | Shared descriptions and guardrail registry changes must reflect the modernized count-lines behavior. | `src/domain/shared/guardrails/tool-guardrail-limits.ts` |
| D9 | 5.2 | 5.1 | WAITING | RESOLVED | Tests, regression fixtures, and TSDoc updates must validate the finalized contract and guardrail surfaces. | `test/**`, `src/**` |

## Legend
[INTENT: REFERENZ]

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

- Preserve the public endpoint name [`search_file_contents_by_regex`](src/application/server/register-inspection-tool-catalog.ts:227) and the existing bounded [`read_files_with_line_numbers`](src/application/server/register-inspection-tool-catalog.ts:83) surface.
- Add only the two new public endpoints agreed in the architecture discussion: `search_file_contents_by_fixed_string` and `read_file_content`.
- Treat `ugrep` as the single primary native search backend for regex, fixed-string, and pattern-aware count paths.
- Treat streaming, range, and cursor-based content reading as a filesystem-reader concern, not a search-binary concern.

