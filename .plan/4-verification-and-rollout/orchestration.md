---
file_type: "orchestration"
file_id: "4"
unit_name: "Verification and rollout"
parent_orchestration: "PLAN.md"
hierarchy_level: 1
unit_status: "pending"
total_tasks: 2
completed_tasks: 0
has_sub_units: false
sub_unit_count: 0
resume_frontier_task: "4.1"
next_frontier_task: "4.2"
todo_window_mode_override: "inherit"
---
# Unit 4: Verification and rollout
[INTENT: ANWEISUNG]

## Navigation
[INTENT: REFERENZ]

- **Parent Orchestration:** [`PLAN.md`](PLAN.md)
- **This Unit:** [`.plan/4-verification-and-rollout/`](.plan/4-verification-and-rollout)
- **Hierarchy Level:** 1
- **Unit Status:** `pending`
- **Progress:** 0/2 tasks

## Execution Frontier
[INTENT: REFERENZ]

- **Resume Frontier Task:** `4.1`
- **Next Frontier Task:** `4.2`
- **Todo Window Mode:** `inherit`
- **Read Scope Rule:** Add automated verification coverage first, then execute the rollout-readiness matrix.

## Tasks
[INTENT: REFERENZ]

- [ ] **4.1 Unit and regression verification coverage** → [`.plan/4-verification-and-rollout/4.1-unit-and-regression-verification-coverage.md`](.plan/4-verification-and-rollout/4.1-unit-and-regression-verification-coverage.md)
  - Classification: `WAITING`
  - Status: `pending`
  - Complexity: `HIGH`
  - Execution Surface Band: `YELLOW`
  - Primary Split Axis: `artifact_family`
  - Files Modified: `test/unit/domain/shared/guardrails/traversal-scope-policy.test.ts`, `test/unit/domain/shared/guardrails/traversal-runtime-budget.test.ts`, `test/regression/inspection/default-traversal-excludes.test.ts`, `test/regression/inspection/explicit-excluded-root-access.test.ts`
  - Blocked By: `3.1`
  - Summary: Add automated coverage that proves broad roots exclude vendor trees by default and explicit access paths remain available.
- [ ] **4.2 Release-readiness and rollout guardrails** → [`.plan/4-verification-and-rollout/4.2-release-readiness-and-rollout-guardrails.md`](.plan/4-verification-and-rollout/4.2-release-readiness-and-rollout-guardrails.md)
  - Classification: `SEQUENTIAL`
  - Status: `pending`
  - Complexity: `MEDIUM`
  - Execution Surface Band: `GREEN`
  - Primary Split Axis: `none`
  - Files Modified: `[]`
  - Blocked By: `4.1`
  - Summary: Execute the final no-breaking verification matrix, explicit-root smoke checks, and rollout-readiness review before the change is considered complete.

## Internal Dependencies (This Level)
[INTENT: REFERENZ]

| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| D1 | `4.2` | `4.1` | `SEQUENTIAL` | `UNRESOLVED` | Rollout-readiness verification depends on the automated coverage added in task `4.1`. | none |

## Execution Order
[INTENT: REFERENZ]

1. Complete `4.1` after implementation and caller-contract work stabilizes.
2. Complete `4.2` after automated coverage exists and the target state can be validated end-to-end.

## Notes for Orchestrating Agent
[INTENT: KONTEXT]

- Treat the default exclusion of vendor/cache trees as an intentional behavior change requested by the user, but preserve additive, explicit access paths to excluded roots.
- Do not close the unit until explicit-root access, caller documentation, and automated coverage all agree.
