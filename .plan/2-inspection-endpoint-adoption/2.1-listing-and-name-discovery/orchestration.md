---
file_type: "orchestration"
file_id: "2.1"
unit_name: "Listing and name discovery"
parent_orchestration: ".plan/2-inspection-endpoint-adoption/orchestration.md"
hierarchy_level: 2
unit_status: "pending"
total_tasks: 2
completed_tasks: 0
has_sub_units: false
sub_unit_count: 0
resume_frontier_task: "2.1.1"
next_frontier_task: "2.1.2"
todo_window_mode_override: "inherit"
---
# Unit 2.1: Listing and name discovery
[INTENT: ANWEISUNG]

## Navigation
[INTENT: REFERENZ]

- **Parent Orchestration:** [`.plan/2-inspection-endpoint-adoption/orchestration.md`](.plan/2-inspection-endpoint-adoption/orchestration.md)
- **This Unit:** [`.plan/2-inspection-endpoint-adoption/2.1-listing-and-name-discovery/`](.plan/2-inspection-endpoint-adoption/2.1-listing-and-name-discovery)
- **Hierarchy Level:** 2
- **Unit Status:** `pending`
- **Progress:** 0/2 tasks

## Execution Frontier
[INTENT: REFERENZ]

- **Resume Frontier Task:** `2.1.1`
- **Next Frontier Task:** `2.1.2`
- **Todo Window Mode:** `inherit`
- **Read Scope Rule:** Execute the listing/name adoption task before the glob adoption task.

## Tasks
[INTENT: REFERENZ]

- [ ] **2.1.1 Listing and name-discovery adoption** → [`.plan/2-inspection-endpoint-adoption/2.1-listing-and-name-discovery/2.1.1-listing-and-name-discovery-adoption.md`](.plan/2-inspection-endpoint-adoption/2.1-listing-and-name-discovery/2.1.1-listing-and-name-discovery-adoption.md)
  - Classification: `WAITING`
  - Status: `pending`
  - Complexity: `HIGH`
  - Execution Surface Band: `YELLOW`
  - Primary Split Axis: `semantic_operation`
  - Files Modified: `src/domain/inspection/list-directory-entries/handler.ts`, `src/domain/inspection/list-directory-entries/schema.ts`, `src/domain/inspection/find-paths-by-name/helpers.ts`, `src/domain/inspection/find-paths-by-name/schema.ts`
  - Blocked By: `1.2`
  - Summary: Apply the shared traversal policy to listing and name-based discovery and harden root-level listing defaults.
- [ ] **2.1.2 Glob discovery adoption** → [`.plan/2-inspection-endpoint-adoption/2.1-listing-and-name-discovery/2.1.2-glob-discovery-adoption.md`](.plan/2-inspection-endpoint-adoption/2.1-listing-and-name-discovery/2.1.2-glob-discovery-adoption.md)
  - Classification: `WAITING`
  - Status: `pending`
  - Complexity: `MEDIUM`
  - Execution Surface Band: `GREEN`
  - Primary Split Axis: `none`
  - Files Modified: `src/domain/inspection/find-files-by-glob/handler.ts`, `src/domain/inspection/find-files-by-glob/schema.ts`
  - Blocked By: `1.2`
  - Summary: Replace endpoint-local glob traversal exclusions with the shared policy while keeping explicit roots and result contracts intact.

## Internal Dependencies (This Level)
[INTENT: REFERENZ]

| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| None | — | — | — | — | These tasks share the same upstream blocker but do not require in-unit ordering once Unit 1 is complete. | — |

## Execution Order
[INTENT: REFERENZ]

1. Wait for task `1.2` to complete.
2. Execute `2.1.1` first because it establishes the root-level listing defaults that should also inform subsequent discovery behavior.
3. Execute `2.1.2` after `2.1.1` or in parallel only if no shared implementation surface emerges during execution.

## Notes for Orchestrating Agent
[INTENT: KONTEXT]

- Preserve the current tool names and structured result shapes.
- Treat the listing default change (`recursive=false`) as an intentional user-requested hardening of the broad-root listing surface.
