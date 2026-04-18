---
file_type: "orchestration"
file_id: "10"
unit_name: "Root Documentation SSOT"
parent_orchestration: "PLAN.md"
hierarchy_level: 1
unit_status: "pending"
total_tasks: 3
completed_tasks: 0
has_sub_units: false
sub_unit_count: 0
resume_frontier_task: "10.1"
next_frontier_task: "10.2"
todo_window_mode_override: "inherit"
---

# Unit 10: Root Documentation SSOT

## Navigation
- **Parent Orchestration:** [`PLAN.md`](../../PLAN.md)
- **This Unit:** `.plan/10-root-documentation-ssot/`
- **Hierarchy Level:** 1
- **Unit Status:** pending
- **Progress:** 0/3 tasks

## Tasks
- [ ] **10.1 Root `CONVENTIONS.md` SSOT** → [`10.1-root-conventions-ssot.md`](./10.1-root-conventions-ssot.md)
  - Classification: WAITING
  - Status: pending
  - Complexity: HIGH
  - Execution Surface Band: GREEN
  - Files Modified: `CONVENTIONS.md`
  - Blocked By: 2.1
  - Summary: Create the root conventions surface and make it the TOC/SSOT for project-wide policies and endpoint-local conventions links.
- [ ] **10.2 Root `DESCRIPTION.md` TOC** → [`10.2-root-description-toc-and-architecture-scope.md`](./10.2-root-description-toc-and-architecture-scope.md)
  - Classification: WAITING
  - Status: pending
  - Complexity: HIGH
  - Execution Surface Band: GREEN
  - Files Modified: `DESCRIPTION.md`
  - Blocked By: 2.1
  - Summary: Refactor the root description surface into a TOC-based architecture index that re-references endpoint-local descriptions.
- [ ] **10.3 Root `README.md` DX TOC** → [`10.3-root-readme-dx-toc.md`](./10.3-root-readme-dx-toc.md)
  - Classification: WAITING
  - Status: pending
  - Complexity: HIGH
  - Execution Surface Band: GREEN
  - Files Modified: `README.md`
  - Blocked By: 2.1
  - Summary: Refactor the root README into a DX-first summary that links to endpoint-local READMEs instead of duplicating endpoint detail.

## Internal Dependencies (This Level)
| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| D1 | 10.2 | 10.1 | SEQUENTIAL | UNRESOLVED | The root description should inherit the project-wide vocabulary established in root conventions. | root docs |
| D2 | 10.3 | 10.2 | SEQUENTIAL | UNRESOLVED | The root README should reflect the final root TOC structure defined by conventions and description. | root docs |

## Execution Order
1. 10.1
2. 10.2
3. 10.3

## Notes for Orchestrating Agent
- These root files must not duplicate endpoint-local detail once endpoint doc triplets exist.

