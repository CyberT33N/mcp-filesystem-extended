---
file_type: "orchestration"
file_id: "1"
unit_name: "Runtime Governance Foundations"
parent_orchestration: "PLAN.md"
hierarchy_level: 1
unit_status: "done"
total_tasks: 1
completed_tasks: 1
has_sub_units: false
sub_unit_count: 0
resume_frontier_task: "1.1"
next_frontier_task: "1.1"
todo_window_mode_override: "inherit"
---

# Unit 1: Runtime Governance Foundations
[INTENT: CONTEXT]

## Navigation
[INTENT: REFERENZ]

- **Parent Orchestration:** [`PLAN.md`](../../PLAN.md)
- **This Unit:** `.plan/1-runtime-governance/`
- **Hierarchy Level:** 1
- **Unit Status:** done
- **Progress:** 1/1 tasks

## Execution Frontier
[INTENT: REFERENZ]

- **Resume Frontier Task:** `1.1`
- **Next Frontier Task:** `1.1`
- **Todo Window Mode:** `inherit`
- **Read Scope Rule:** For ordinary resume, read this orchestration file and then the frontier task file only.

## Tasks
[INTENT: REFERENZ]

- [x] **1.1 Define the runtime I/O capability profile and execution policy registry** → [`1.1-io-capability-profile-and-execution-policy-registry.md`](./1.1-io-capability-profile-and-execution-policy-registry.md)
  - Classification: `ISOLATED`
  - Status: `DONE`
  - Complexity: `MEDIUM`
  - Execution Surface Band: `GREEN`
  - Primary Split Axis: `none`
  - Files Modified: `src/domain/shared/runtime/io-capability-profile.ts`, `src/infrastructure/runtime/io-capability-detector.ts`, `src/domain/shared/search/search-execution-policy.ts`
  - Blocked By: `none`
  - Summary: Create the shared capability and policy surfaces that every later large-text endpoint will consume.

## Internal Dependencies (This Level)
[INTENT: REFERENZ]

| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| none | — | — | — | — | This unit has one isolated foundational task. | — |

## Execution Order
[INTENT: ANWEISUNG]

1. Execute task `1.1`.
2. Re-anchor [`PLAN.md`](../../PLAN.md) after task completion.
3. Unblock waiting units that depend on the runtime capability profile.

## Notes for Orchestrating Agent
[INTENT: CONSTRAINT]

- Do not start any search, read, or count refactor before task `1.1` is done.
- This task defines the vocabulary for I/O tiers, prediction confidence, preview thresholds, and task escalation.

