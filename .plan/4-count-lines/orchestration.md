---
file_type: "orchestration"
file_id: "4"
unit_name: "Count Lines Modernization"
parent_orchestration: "PLAN.md"
hierarchy_level: 1
unit_status: "pending"
total_tasks: 1
completed_tasks: 0
has_sub_units: false
sub_unit_count: 0
resume_frontier_task: "4.1"
next_frontier_task: "4.1"
todo_window_mode_override: "inherit"
---

# Unit 4: Count Lines Modernization
[INTENT: CONTEXT]

## Navigation
[INTENT: REFERENZ]

- **Parent Orchestration:** [`PLAN.md`](../../PLAN.md)
- **This Unit:** `.plan/4-count-lines/`
- **Hierarchy Level:** 1
- **Unit Status:** pending
- **Progress:** 0/1 tasks

## Execution Frontier
[INTENT: REFERENZ]

- **Resume Frontier Task:** `4.1`
- **Next Frontier Task:** `4.1`
- **Todo Window Mode:** `inherit`
- **Read Scope Rule:** Read this orchestration file first, then the frontier task and its upstream task references.

## Tasks
[INTENT: REFERENZ]

- [ ] **4.1 Modernize `count_lines` for large-file-safe total and pattern-aware counting** → [`4.1-modernize-count-lines-for-large-file-workloads.md`](./4.1-modernize-count-lines-for-large-file-workloads.md)
  - Classification: `WAITING`
  - Status: `pending`
  - Complexity: `HIGH`
  - Execution Surface Band: `YELLOW`
  - Primary Split Axis: `none`
  - Files Modified: `src/domain/inspection/count-lines/schema.ts`, `src/domain/inspection/count-lines/handler.ts`, `src/infrastructure/filesystem/streaming-line-counter.ts`, `src/domain/shared/search/count-query-policy.ts`
  - Blocked By: `1.1`
  - Summary: Replace full in-process large-file counting with split execution paths for total counts and pattern-aware counts.

## Internal Dependencies (This Level)
[INTENT: REFERENZ]

| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| none | — | — | — | — | This unit has one waiting task with cross-unit prerequisites only. | — |

## Execution Order
[INTENT: ANWEISUNG]

1. Wait for tasks `1.1` and `2.1`.
2. Execute `4.1`.
3. Re-anchor [`PLAN.md`](../../PLAN.md) and this orchestration file after completion.

## Notes for Orchestrating Agent
[INTENT: CONSTRAINT]

- This task must keep the existing public `count_lines` endpoint contract intact where possible.
- Pattern-driven counting should reuse the shared native search backend; total line counts should remain streaming-reader-native.

