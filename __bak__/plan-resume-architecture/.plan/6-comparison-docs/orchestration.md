---
file_type: "orchestration"
file_id: "6"
unit_name: "Comparison Docs"
parent_orchestration: "PLAN.md"
hierarchy_level: 1
unit_status: "done"
total_tasks: 2
completed_tasks: 2
has_sub_units: false
sub_unit_count: 0
resume_frontier_task: "6.2"
next_frontier_task: "6.2"
todo_window_mode_override: "inherit"
---

# Unit 6: Comparison Docs

## Navigation
- **Parent Orchestration:** [`PLAN.md`](../../PLAN.md)
- **This Unit:** `.plan/6-comparison-docs/`
- **Hierarchy Level:** 1
- **Unit Status:** done
- **Progress:** 2/2 tasks

## Tasks
- [x] **6.1 `diff_files` doc set** → [`6.1-diff-files-doc-set.md`](./6.1-diff-files-doc-set.md)
  - Classification: ISOLATED
  - Status: done
  - Complexity: MEDIUM
  - Execution Surface Band: GREEN
  - Files Modified: endpoint-local doc triplet
  - Blocked By: none
  - Summary: Document the file-backed diff surface and its on-disk comparison contract.
- [x] **6.2 `diff_text_content` doc set** → [`6.2-diff-text-content-doc-set.md`](./6.2-diff-text-content-doc-set.md)
  - Classification: SEQUENTIAL
  - Status: done
  - Complexity: MEDIUM
  - Execution Surface Band: GREEN
  - Files Modified: endpoint-local doc triplet
  - Blocked By: none
  - Summary: Document the in-memory raw-text diff surface and its stricter caller-supplied budget model.

## Internal Dependencies (This Level)
| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| D1 | 6.2 | 6.1 | SEQUENTIAL | RESOLVED | The raw-text diff docs should contrast themselves against the file-backed diff docs. | comparison endpoint docs |

## Execution Order
1. 6.1
2. 6.2

## Notes for Orchestrating Agent
- Preserve the distinction between file-backed diffing and caller-supplied raw-text diffing.

