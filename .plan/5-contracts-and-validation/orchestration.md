---
file_type: "orchestration"
file_id: "5"
unit_name: "Contracts, Validation, and Documentation"
parent_orchestration: "PLAN.md"
hierarchy_level: 1
 unit_status: "in_progress"
total_tasks: 2
 completed_tasks: 1
has_sub_units: false
sub_unit_count: 0
 resume_frontier_task: "5.2"
 next_frontier_task: "5.2"
todo_window_mode_override: "inherit"
---

# Unit 5: Contracts, Validation, and Documentation
[INTENT: CONTEXT]

## Navigation
[INTENT: REFERENZ]

- **Parent Orchestration:** [`PLAN.md`](../../PLAN.md)
- **This Unit:** `.plan/5-contracts-and-validation/`
- **Hierarchy Level:** 1
- **Unit Status:** in_progress
- **Progress:** 1/2 tasks

## Execution Frontier
[INTENT: REFERENZ]

- **Resume Frontier Task:** `5.2`
- **Next Frontier Task:** `5.2`
- **Todo Window Mode:** `inherit`
- **Read Scope Rule:** Read the frontier task first and then its upstream task references, because both tasks in this unit depend on finalized implementation contracts from earlier units.

## Tasks
[INTENT: REFERENZ]

- [x] **5.1 Harmonize shared guardrail constants, failure semantics, and server descriptions** → [`5.1-harmonize-guardrails-failure-semantics-and-server-descriptions.md`](./5.1-harmonize-guardrails-failure-semantics-and-server-descriptions.md)
  - Classification: `WAITING`
  - Status: `done`
  - Complexity: `HIGH`
  - Execution Surface Band: `YELLOW`
  - Primary Split Axis: `none`
  - Files Modified: `src/domain/shared/guardrails/tool-guardrail-limits.ts`, `src/application/server/register-inspection-tool-catalog.ts`, `src/application/server/server-instructions.ts`, `src/application/server/filesystem-server.ts`
  - Blocked By: `2.2, 2.3, 3.1, 4.1`
  - Summary: Align the public contract text, refusal semantics, and shared limits with the finalized runtime architecture.
- [~] **5.2 Add tests, regression coverage, and architecture-grade TSDoc surfaces** → [`5.2-add-tests-regression-coverage-and-architecture-tsdocs.md`](./5.2-add-tests-regression-coverage-and-architecture-tsdocs.md)
  - Classification: `SEQUENTIAL`
  - Status: `IN_PROGRESS`
  - Complexity: `HIGH`
  - Execution Surface Band: `YELLOW`
  - Primary Split Axis: `none`
  - Files Modified: `test/unit/**`, `test/regression/**`, `src/domain/**`, `src/infrastructure/**`, `src/application/server/**`
  - Blocked By: `none`
  - Summary: Add automated coverage for the new runtime behavior and make the architectural TSDoc rationale explicit in the touched TypeScript surfaces.

## Internal Dependencies (This Level)
[INTENT: REFERENZ]

| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| D5.1 | 5.2 | 5.1 | SEQUENTIAL | RESOLVED | Tests and TSDoc updates must validate the finalized guardrail registry and public contract wording. | `src/domain/shared/guardrails/tool-guardrail-limits.ts`, `src/application/server/**` |

## Execution Order
[INTENT: ANWEISUNG]

1. Wait for the search, read-content, and count-lines implementation units to finish.
2. Execute `5.1`.
3. Execute `5.2`.

## Notes for Orchestrating Agent
[INTENT: CONSTRAINT]

- Keep the work in this unit additive and contract-safe.
- Public docs and TSDocs must explain the architecture rationale, the no-breaking surface commitments, and the new guardrail behavior in clear English.

