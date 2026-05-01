---
file_type: "orchestration"
file_id: "8"
unit_name: "Path Mutation Docs"
parent_orchestration: "PLAN.md"
hierarchy_level: 1
unit_status: "in_progress"
total_tasks: 4
completed_tasks: 3
has_sub_units: false
sub_unit_count: 0
resume_frontier_task: "8.4"
next_frontier_task: "9.1"
todo_window_mode_override: "inherit"
---

# Unit 8: Path Mutation Docs

## Navigation
- **Parent Orchestration:** [`PLAN.md`](../../PLAN.md)
- **This Unit:** `.plan/8-path-mutation-docs/`
- **Hierarchy Level:** 1
- **Unit Status:** in_progress
- **Progress:** 2/4 tasks

## Tasks
- [x] **8.1 `create_directories` doc set** → [`8.1-create-directories-doc-set.md`](./8.1-create-directories-doc-set.md)
  - Classification: ISOLATED
  - Status: done
  - Complexity: MEDIUM
  - Execution Surface Band: GREEN
  - Files Modified: endpoint-local doc triplet
  - Blocked By: none
  - Summary: Document the idempotent directory-creation surface.
- [x] **8.2 `copy_paths` doc set** → [`8.2-copy-paths-doc-set.md`](./8.2-copy-paths-doc-set.md)
  - Classification: ISOLATED
  - Status: done
  - Complexity: MEDIUM
  - Execution Surface Band: GREEN
  - Files Modified: endpoint-local doc triplet
  - Blocked By: none
  - Summary: Document the copy surface and its non-destructive destination semantics.
- [ ] **8.3 `move_paths` doc set** → [`8.3-move-paths-doc-set.md`](./8.3-move-paths-doc-set.md)
  - Classification: ISOLATED
  - Status: done
  - Complexity: MEDIUM
  - Execution Surface Band: GREEN
  - Files Modified: endpoint-local doc triplet
  - Blocked By: none
  - Summary: Document the move/rename surface and its overwrite semantics.
- [ ] **8.4 `delete_paths` doc set** → [`8.4-delete-paths-doc-set.md`](./8.4-delete-paths-doc-set.md)
  - Classification: SEQUENTIAL
  - Status: pending
  - Complexity: MEDIUM
  - Execution Surface Band: GREEN
  - Files Modified: endpoint-local doc triplet
  - Blocked By: none
  - Summary: Document the destructive delete surface and its blast-radius rules.

## Internal Dependencies (This Level)
| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| D1 | 8.4 | 8.2 | SEQUENTIAL | RESOLVED | Delete docs should contrast themselves with copy semantics. | path mutation docs |
| D2 | 8.4 | 8.3 | SEQUENTIAL | RESOLVED | Delete docs should contrast themselves with move semantics. | path mutation docs |

## Execution Order
1. 8.1
2. 8.2
3. 8.3
4. 8.4

## Notes for Orchestrating Agent
- Keep path-oriented mutation semantics distinct from content mutation semantics.
