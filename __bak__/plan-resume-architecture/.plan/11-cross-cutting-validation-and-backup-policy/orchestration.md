---
file_type: "orchestration"
file_id: "11"
unit_name: "Cross-Cutting Validation and Backup Policy"
parent_orchestration: "PLAN.md"
hierarchy_level: 1
unit_status: "in_progress"
total_tasks: 3
completed_tasks: 2
has_sub_units: false
sub_unit_count: 0
resume_frontier_task: "11.3"
next_frontier_task: "11.3"
todo_window_mode_override: "inherit"
---

# Unit 11: Cross-Cutting Validation and Backup Policy

## Navigation
- **Parent Orchestration:** [`PLAN.md`](../../PLAN.md)
- **This Unit:** `.plan/11-cross-cutting-validation-and-backup-policy/`
- **Hierarchy Level:** 1
- **Unit Status:** in_progress
- **Progress:** 2/3 tasks

## Tasks
- [x] **11.1 Public code-contract alignment** → [`11.1-public-code-contract-alignment.md`](./11.1-public-code-contract-alignment.md)
  - Classification: ISOLATED
  - Status: done
  - Complexity: HIGH
  - Execution Surface Band: GREEN
  - Files Modified: public registration/instruction/fuse files
  - Blocked By: none
  - Summary: Reconfirm and, only where residual drift remains, align caller-facing code surfaces with the finalized runtime architecture now that the unit-1 runtime blocker is resolved.
- [x] **11.2 Backup-plan reference policy and link audit** → [`11.2-backup-plan-reference-policy-and-link-audit.md`](./11.2-backup-plan-reference-policy-and-link-audit.md)
  - Classification: ISOLATED
  - Status: done
  - Complexity: HIGH
  - Execution Surface Band: GREEN
  - Files Modified: none
  - Blocked By: none
  - Summary: Verify that backup-plan references are narrow, intentional, and clearly marked as historical-only across root and endpoint docs.
- [x]] **11.3 Final docs and architecture validation** → [`11.3-final-docs-and-architecture-validation.md`](./11.3-final-docs-and-architecture-validation.md)
  - Classification: WAITING
  - Status: pending
  - Complexity: HIGH
  - Execution Surface Band: GREEN
  - Files Modified: none
  - Blocked By: none
  - Summary: Execute the final no-breaking, link-integrity, SSOT, and architecture-consistency validation sweep.

## Internal Dependencies (This Level)
| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| D1 | 11.2 | 11.1 | WAITING | RESOLVED | Backup-policy and link audit require the reconfirmed caller-facing code-contract wording surface to exist, even when only residual drift corrections were needed. | root docs, endpoint docs, public contract files |
| D2 | 11.3 | 11.2 | SEQUENTIAL | RESOLVED | Final validation runs only after backup-policy and link audit complete. | full documentation surface |

## Execution Order
1. 11.1
2. 11.2
3. 11.3

## Notes for Orchestrating Agent
- `files_modified: none` means the validation tasks are allowed to stop and escalate mismatches instead of silently correcting them without trace.
