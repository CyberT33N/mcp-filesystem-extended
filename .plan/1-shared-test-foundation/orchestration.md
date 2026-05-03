---
file_type: "orchestration"
file_id: "1"
unit_name: "Shared Test Foundation"
parent_orchestration: "PLAN.md"
hierarchy_level: 1
unit_status: "pending"
total_tasks: 1
completed_tasks: 0
has_sub_units: false
sub_unit_count: 0
resume_frontier_task: "1.1"
next_frontier_task: "1.1"
todo_window_mode_override: "ACTIVE_ONLY"
---

# Unit 1: Shared Test Foundation

## Navigation
- **Parent Orchestration:** `PLAN.md`
- **Unit Status:** pending
- **Progress:** 0/1 tasks

## Execution Frontier
- **Resume Frontier Task:** `1.1`
- **Next Frontier Task:** `1.1`
- **Todo Window Mode:** `ACTIVE_ONLY`

## Tasks
- [ ] **1.1 Shared inspection fixture foundation** → `1.1-shared-inspection-fixture-foundation.md`
  - Classification: `ISOLATED`
  - Status: `pending`
  - Complexity: `MEDIUM`
  - Execution Surface Band: `GREEN`
  - Primary Split Axis: `artifact_family`
  - Files Modified: `3 shared utils + shared fixture usage contract`
  - Blocked By: `none`
  - Summary: Creates the shared search fixture registry, loader, and assertion helpers that later inspection search tests must consume.

## Internal Dependencies
| ID | Source Task | Target Task | Type | Status | Description |
|----|------------|-------------|------|--------|-------------|
| — | — | — | — | — | No internal dependencies. |

## Notes for Orchestrating Agent
- This unit must complete before the fixed-string and regex search family units start modifying shared inspection fixture paths.

