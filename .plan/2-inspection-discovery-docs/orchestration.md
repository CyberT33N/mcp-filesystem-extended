---
file_type: "orchestration"
file_id: "2"
unit_name: "Inspection Discovery Docs"
parent_orchestration: "PLAN.md"
hierarchy_level: 1
unit_status: "in_progress"
total_tasks: 3
completed_tasks: 1
has_sub_units: false
sub_unit_count: 0
resume_frontier_task: "2.2"
next_frontier_task: "2.3"
todo_window_mode_override: "inherit"
---

# Unit 2: Inspection Discovery Docs

## Navigation
- **Parent Orchestration:** [`PLAN.md`](../../PLAN.md)
- **This Unit:** `.plan/2-inspection-discovery-docs/`
- **Hierarchy Level:** 1
- **Unit Status:** in_progress
- **Progress:** 1/3 tasks

## Tasks
- [x] **2.1 `list_directory_entries` doc set** → [`2.1-list-directory-entries-doc-set.md`](./2.1-list-directory-entries-doc-set.md)
  - Classification: ISOLATED
  - Status: done
  - Complexity: MEDIUM
  - Execution Surface Band: GREEN
  - Files Modified: endpoint-local doc triplet
  - Blocked By: none
  - Summary: Create endpoint-local conventions, description, and README for the structured directory-listing surface.
- [ ] **2.2 `find_paths_by_name` doc set** → [`2.2-find-paths-by-name-doc-set.md`](./2.2-find-paths-by-name-doc-set.md)
  - Classification: ISOLATED
  - Status: pending
  - Complexity: MEDIUM
  - Execution Surface Band: GREEN
  - Files Modified: endpoint-local doc triplet
  - Blocked By: none
  - Summary: Create endpoint-local conventions, description, and README for the name-based path discovery surface.
- [ ] **2.3 `find_files_by_glob` doc set** → [`2.3-find-files-by-glob-doc-set.md`](./2.3-find-files-by-glob-doc-set.md)
  - Classification: ISOLATED
  - Status: pending
  - Complexity: MEDIUM
  - Execution Surface Band: GREEN
  - Files Modified: endpoint-local doc triplet
  - Blocked By: none
  - Summary: Create endpoint-local conventions, description, and README for the glob-based discovery surface.

## Internal Dependencies (This Level)
| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| D1 | 2.1 | 1.5 | WAITING | RESOLVED | Discovery docs now re-anchor the finalized traversal/preflight/runtime-budget semantics from completed unit 1. | discovery endpoint docs |
| D2 | 2.2 | 1.5 | WAITING | RESOLVED | Discovery docs now re-anchor the finalized traversal/preflight/runtime-budget semantics from completed unit 1. | discovery endpoint docs |
| D3 | 2.3 | 1.5 | WAITING | RESOLVED | Discovery docs now re-anchor the finalized traversal/preflight/runtime-budget semantics from completed unit 1. | discovery endpoint docs |

## Execution Order
1. 2.1, 2.2, and 2.3 may now execute in any order or in parallel.

## Notes for Orchestrating Agent
- Each task creates exactly one endpoint-local documentation triplet.

