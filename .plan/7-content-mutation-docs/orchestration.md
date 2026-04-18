---
file_type: "orchestration"
file_id: "7"
unit_name: "Content Mutation Docs"
parent_orchestration: "PLAN.md"
hierarchy_level: 1
unit_status: "pending"
total_tasks: 3
completed_tasks: 0
has_sub_units: false
sub_unit_count: 0
resume_frontier_task: "7.1"
next_frontier_task: "7.2"
todo_window_mode_override: "inherit"
---

# Unit 7: Content Mutation Docs

## Navigation
- **Parent Orchestration:** [`PLAN.md`](../../PLAN.md)
- **This Unit:** `.plan/7-content-mutation-docs/`
- **Hierarchy Level:** 1
- **Unit Status:** pending
- **Progress:** 0/3 tasks

## Tasks
- [ ] **7.1 `create_files` doc set** → [`7.1-create-files-doc-set.md`](./7.1-create-files-doc-set.md)
  - Classification: ISOLATED
  - Status: pending
  - Complexity: MEDIUM
  - Execution Surface Band: GREEN
  - Files Modified: endpoint-local doc triplet
  - Blocked By: none
  - Summary: Document the additive file-creation endpoint and its per-item plus cumulative content budgets.
- [ ] **7.2 `append_files` doc set** → [`7.2-append-files-doc-set.md`](./7.2-append-files-doc-set.md)
  - Classification: ISOLATED
  - Status: pending
  - Complexity: MEDIUM
  - Execution Surface Band: GREEN
  - Files Modified: endpoint-local doc triplet
  - Blocked By: none
  - Summary: Document the additive append-only endpoint and its distinction from targeted replacement.
- [ ] **7.3 `replace_file_line_ranges` doc set** → [`7.3-replace-file-line-ranges-doc-set.md`](./7.3-replace-file-line-ranges-doc-set.md)
  - Classification: ISOLATED
  - Status: pending
  - Complexity: HIGH
  - Execution Surface Band: GREEN
  - Files Modified: endpoint-local doc triplet
  - Blocked By: none
  - Summary: Document the targeted line-range replacement endpoint and its inclusive-range contract.

## Internal Dependencies (This Level)
| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| D1 | 7.3 | 7.1 | SEQUENTIAL | UNRESOLVED | Replacement docs should contrast themselves with additive creation semantics. | content mutation docs |
| D2 | 7.3 | 7.2 | SEQUENTIAL | UNRESOLVED | Replacement docs should contrast themselves with append-only semantics. | content mutation docs |

## Execution Order
1. 7.1
2. 7.2
3. 7.3

## Notes for Orchestrating Agent
- Keep additive and targeted mutation semantics explicit and non-overlapping.

