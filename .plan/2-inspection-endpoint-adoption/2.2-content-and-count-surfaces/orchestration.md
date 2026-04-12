---
file_type: "orchestration"
file_id: "2.2"
unit_name: "Content and count surfaces"
parent_orchestration: ".plan/2-inspection-endpoint-adoption/orchestration.md"
hierarchy_level: 2
unit_status: "pending"
total_tasks: 2
completed_tasks: 0
has_sub_units: false
sub_unit_count: 0
resume_frontier_task: "2.2.1"
next_frontier_task: "2.2.2"
todo_window_mode_override: "inherit"
---
# Unit 2.2: Content and count surfaces
[INTENT: ANWEISUNG]

## Navigation
[INTENT: REFERENZ]

- **Parent Orchestration:** [`.plan/2-inspection-endpoint-adoption/orchestration.md`](.plan/2-inspection-endpoint-adoption/orchestration.md)
- **This Unit:** [`.plan/2-inspection-endpoint-adoption/2.2-content-and-count-surfaces/`](.plan/2-inspection-endpoint-adoption/2.2-content-and-count-surfaces)
- **Hierarchy Level:** 2
- **Unit Status:** `pending`
- **Progress:** 0/2 tasks

## Execution Frontier
[INTENT: REFERENZ]

- **Resume Frontier Task:** `2.2.1`
- **Next Frontier Task:** `2.2.2`
- **Todo Window Mode:** `inherit`
- **Read Scope Rule:** Prioritize regex adoption because it is the timeout-sensitive surface that triggered the original investigation.

## Tasks
[INTENT: REFERENZ]

- [ ] **2.2.1 Regex search adoption** → [`.plan/2-inspection-endpoint-adoption/2.2-content-and-count-surfaces/2.2.1-regex-search-adoption.md`](.plan/2-inspection-endpoint-adoption/2.2-content-and-count-surfaces/2.2.1-regex-search-adoption.md)
  - Classification: `WAITING`
  - Status: `pending`
  - Complexity: `HIGH`
  - Execution Surface Band: `YELLOW`
  - Primary Split Axis: `semantic_operation`
  - Files Modified: `src/domain/inspection/search-file-contents-by-regex/handler.ts`, `src/domain/inspection/search-file-contents-by-regex/schema.ts`
  - Blocked By: `1.2`
  - Summary: Apply the shared traversal policy to regex search and consume the new traversal-budget refusal surfaces before broad candidate traversal can time out.
- [ ] **2.2.2 Count-lines adoption** → [`.plan/2-inspection-endpoint-adoption/2.2-content-and-count-surfaces/2.2.2-count-lines-adoption.md`](.plan/2-inspection-endpoint-adoption/2.2-content-and-count-surfaces/2.2.2-count-lines-adoption.md)
  - Classification: `WAITING`
  - Status: `pending`
  - Complexity: `MEDIUM`
  - Execution Surface Band: `GREEN`
  - Primary Split Axis: `none`
  - Files Modified: `src/domain/inspection/count-lines/handler.ts`, `src/domain/inspection/count-lines/schema.ts`
  - Blocked By: `1.2`
  - Summary: Reuse the shared traversal policy inside recursive line counting so recursive counts no longer walk vendor or cache trees by default.

## Internal Dependencies (This Level)
[INTENT: REFERENZ]

| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| None | — | — | — | — | Both tasks depend on Unit 1 but do not require an additional in-unit blocker before they can start. | — |

## Execution Order
[INTENT: REFERENZ]

1. Wait for task `1.2` to complete.
2. Execute `2.2.1` first because it covers the timeout-prone regex traversal surface.
3. Execute `2.2.2` after `2.2.1` or in parallel only if no shared runtime helper surface emerges during implementation.

## Notes for Orchestrating Agent
[INTENT: KONTEXT]

- Preserve existing regex match output semantics except where the new traversal policy and traversal-budget refusals intentionally narrow unsafe broad-root execution.
- Keep `count_lines` consistent with the traversal policy used by the other recursive inspection endpoints.
