---
file_type: "orchestration"
file_id: "3"
unit_name: "Inspection Metadata and Integrity Docs"
parent_orchestration: "PLAN.md"
hierarchy_level: 1
unit_status: "pending"
total_tasks: 3
completed_tasks: 0
has_sub_units: false
sub_unit_count: 0
resume_frontier_task: "3.1"
next_frontier_task: "3.2"
todo_window_mode_override: "inherit"
---

# Unit 3: Inspection Metadata and Integrity Docs

## Navigation
- **Parent Orchestration:** [`PLAN.md`](../../PLAN.md)
- **This Unit:** `.plan/3-inspection-metadata-and-integrity-docs/`
- **Hierarchy Level:** 1
- **Unit Status:** pending
- **Progress:** 0/3 tasks

## Tasks
- [ ] **3.1 `get_path_metadata` doc set** → [`3.1-get-path-metadata-doc-set.md`](./3.1-get-path-metadata-doc-set.md)
  - Classification: ISOLATED
  - Status: pending
  - Complexity: MEDIUM
  - Execution Surface Band: GREEN
  - Files Modified: endpoint-local doc triplet
  - Blocked By: none
  - Summary: Document the metadata endpoint as a structured preflight and path-fact surface.
- [ ] **3.2 `get_file_checksums` doc set** → [`3.2-get-file-checksums-doc-set.md`](./3.2-get-file-checksums-doc-set.md)
  - Classification: ISOLATED
  - Status: pending
  - Complexity: MEDIUM
  - Execution Surface Band: GREEN
  - Files Modified: endpoint-local doc triplet
  - Blocked By: none
  - Summary: Document the checksum-generation endpoint as a read-only integrity surface.
- [ ] **3.3 `verify_file_checksums` doc set** → [`3.3-verify-file-checksums-doc-set.md`](./3.3-verify-file-checksums-doc-set.md)
  - Classification: SEQUENTIAL
  - Status: pending
  - Complexity: MEDIUM
  - Execution Surface Band: GREEN
  - Files Modified: endpoint-local doc triplet
  - Blocked By: 3.2
  - Summary: Document the checksum-verification endpoint as the expected-hash validation surface.

## Internal Dependencies (This Level)
| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| D1 | 3.3 | 3.2 | SEQUENTIAL | UNRESOLVED | Verification docs should inherit the checksum-generation terminology and integrity vocabulary. | integrity endpoint docs |

## Execution Order
1. 3.1
2. 3.2
3. 3.3

## Notes for Orchestrating Agent
- This unit does not wait on runtime-architecture refactors because these endpoints are contract-stable and not part of the hybrid/timeouting redesign core.

