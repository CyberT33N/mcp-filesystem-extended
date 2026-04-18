---
file_type: "orchestration"
file_id: "9"
unit_name: "Server-Scope Docs"
parent_orchestration: "PLAN.md"
hierarchy_level: 1
unit_status: "pending"
total_tasks: 1
completed_tasks: 0
has_sub_units: false
sub_unit_count: 0
resume_frontier_task: "9.1"
next_frontier_task: "none"
todo_window_mode_override: "inherit"
---

# Unit 9: Server-Scope Docs

## Navigation
- **Parent Orchestration:** [`PLAN.md`](../../PLAN.md)
- **This Unit:** `.plan/9-server-scope-docs/`
- **Hierarchy Level:** 1
- **Unit Status:** pending
- **Progress:** 0/1 tasks

## Tasks
- [ ] **9.1 `list_allowed_directories` doc set** → [`9.1-list-allowed-directories-doc-set.md`](./9.1-list-allowed-directories-doc-set.md)
  - Classification: ISOLATED
  - Status: pending
  - Complexity: MEDIUM
  - Execution Surface Band: GREEN
  - Files Modified: docs-only endpoint folder under `src/application/server/list-allowed-directories/`
  - Blocked By: none
  - Summary: Create the documentation triplet for the application-owned server-scope tool.

## Internal Dependencies (This Level)
| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| — | — | — | — | — | No internal dependencies. | — |

## Execution Order
1. 9.1

## Notes for Orchestrating Agent
- The documentation lives in a docs-only endpoint folder because this server-scope tool does not currently have its own code directory.

