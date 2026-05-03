---
file_type: "orchestration"
file_id: "9"
unit_name: "Build Gating"
parent_orchestration: "PLAN.md"
hierarchy_level: 1
unit_status: "pending"
total_tasks: 1
completed_tasks: 0
has_sub_units: false
sub_unit_count: 0
resume_frontier_task: "9.1"
next_frontier_task: "9.1"
todo_window_mode_override: "ACTIVE_ONLY"
---

# Unit 9: Build Gating

## Navigation
- **Parent Orchestration:** `PLAN.md`
- **Unit Status:** pending
- **Progress:** 0/1 tasks

## Execution Frontier
- **Resume Frontier Task:** `9.1`
- **Next Frontier Task:** `9.1`
- **Todo Window Mode:** `ACTIVE_ONLY`

## Tasks
- [ ] **9.1 Package build process test gate** → `9.1-package-build-process-test-gate.md`
  - Classification: `WAITING`
  - Status: `pending`
  - Complexity: `LOW`
  - Execution Surface Band: `GREEN`
  - Primary Split Axis: `artifact_family`
  - Files Modified: `package.json`
  - Blocked By: `8.1`
  - Summary: Wires the package build lifecycle so a deterministic non-watch test aggregate runs before `build`, and `build` continues only when that test aggregate succeeds.

## Internal Dependencies
| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| — | — | — | — | — | No internal same-unit dependency. |

## Notes for Orchestrating Agent
- This unit must be executed only after the planned runtime test coverage from Units 1-8 is materially in place.
- Preserve the existing `build` script literal `tsup`; gate the lifecycle through package scripts instead of replacing the build tool itself.
- Do not use the existing [`test`](package.json:45) script as the build gate because it is watch-oriented and non-deterministic for a build lifecycle.

