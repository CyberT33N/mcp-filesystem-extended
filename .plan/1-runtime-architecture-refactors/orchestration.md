---
file_type: "orchestration"
file_id: "1"
unit_name: "Runtime Architecture Refactors"
parent_orchestration: "PLAN.md"
hierarchy_level: 1
unit_status: "in_progress"
 total_tasks: 5
  completed_tasks: 3
 has_sub_units: false
 sub_unit_count: 0
  resume_frontier_task: "1.4"
  next_frontier_task: "1.5"
todo_window_mode_override: "inherit"
---

# Unit 1: Runtime Architecture Refactors

## Navigation
- **Parent Orchestration:** [`PLAN.md`](../../PLAN.md)
- **This Unit:** `.plan/1-runtime-architecture-refactors/`
- **Hierarchy Level:** 1
- **Unit Status:** in_progress
- **Progress:** 3/5 tasks

## Execution Frontier
- **Resume Frontier Task:** `1.4`
- **Next Frontier Task:** `1.5`
- **Todo Window Mode:** `inherit`

## Tasks
- [x] **1.1 Shared inspection state taxonomy and sampling policy** → [`1.1-shared-inspection-state-taxonomy-and-sampling-policy.md`](./1.1-shared-inspection-state-taxonomy-and-sampling-policy.md)
  - Classification: ISOLATED
  - Status: done
  - Complexity: HIGH
  - Execution Surface Band: GREEN
  - Files Modified: shared search-state contracts
  - Blocked By: none
  - Summary: Replace the current boolean text/binary model with an operation-aware inspection-state taxonomy and bounded sampling policy.
- [x] **1.2 Fixed-string hybrid search lane** → [`1.2-fixed-string-hybrid-search-lane.md`](./1.2-fixed-string-hybrid-search-lane.md)
  - Classification: SEQUENTIAL
  - Status: done
  - Complexity: HIGH
  - Execution Surface Band: GREEN
  - Files Modified: fixed-string search lane and shared `ugrep` argument planning
  - Blocked By: none
  - Summary: Make literal search hybrid-aware without collapsing unsupported pure-binary surfaces into normal text search.
- [x] **1.3 Regex and count state-gating alignment** → [`1.3-regex-and-count-state-gating-alignment.md`](./1.3-regex-and-count-state-gating-alignment.md)
  - Classification: SEQUENTIAL
  - Status: done
  - Complexity: HIGH
  - Execution Surface Band: GREEN
  - Files Modified: regex and count execution lanes
  - Blocked By: none
  - Summary: Bind regex and pattern-aware count behavior to the same shared inspection-state semantics and execution lanes.
- [x] **1.4 Read endpoint internal SSOT refactor** → [`1.4-read-endpoint-internal-ssot-refactor.md`](./1.4-read-endpoint-internal-ssot-refactor.md)
  - Classification: SEQUENTIAL
  - Status: DONE
  - Complexity: HIGH
  - Execution Surface Band: GREEN
  - Files Modified: read handlers and shared read core
  - Blocked By: none
  - Summary: Preserve the two public read endpoints while consolidating their internal read logic and gating on a shared core.
- [ ] **1.5 Traversal preflight and runtime-budget refactor** → [`1.5-traversal-preflight-and-runtime-budget-refactor.md`](./1.5-traversal-preflight-and-runtime-budget-refactor.md)
  - Classification: SEQUENTIAL
  - Status: pending
  - Complexity: HIGH
  - Execution Surface Band: GREEN
  - Files Modified: traversal guardrails and recursive discovery/search surfaces
  - Blocked By: none
  - Summary: Demote timeout-first traversal refusal into a deeper safeguard and introduce preflight-driven scope handling for broad valid workloads.

## Internal Dependencies (This Level)
| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| D1 | 1.2 | 1.1 | SEQUENTIAL | RESOLVED | Fixed-string hybrid search depends on the shared inspection-state vocabulary. | `src/domain/shared/search/text-binary-classifier.ts` |
| D2 | 1.3 | 1.2 | SEQUENTIAL | RESOLVED | Regex/count alignment assumes the fixed-string lane and shared state semantics are already bound. | `src/domain/shared/search/search-execution-policy.ts` |
| D3 | 1.4 | 1.3 | SEQUENTIAL | RESOLVED | Read-core SSOT refactor depends on the finalized inspection-state and execution-lane rules. | `src/domain/inspection/read-file-content/**`, `src/domain/inspection/read-files-with-line-numbers/**` |
| D4 | 1.5 | 1.4 | SEQUENTIAL | RESOLVED | Traversal governance refactor should land after state and read-core semantics are stabilized. | `src/domain/shared/guardrails/tool-guardrail-limits.ts` |

## Execution Order
1. 1.1
2. 1.2
3. 1.3
4. 1.4
5. 1.5

## Notes for Orchestrating Agent
- Re-reference [`__bak__/plan-ugrep/PLAN.md`](../../__bak__/plan-ugrep/PLAN.md) only as historical implementation evidence.
- No task in this unit may collapse the separate public read endpoints into a single public mega-endpoint.

