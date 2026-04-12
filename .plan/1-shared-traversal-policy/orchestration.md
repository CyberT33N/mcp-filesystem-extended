---
file_type: "orchestration"
file_id: "1"
unit_name: "Shared traversal policy"
parent_orchestration: "PLAN.md"
hierarchy_level: 1
unit_status: "pending"
total_tasks: 2
completed_tasks: 0
has_sub_units: false
sub_unit_count: 0
resume_frontier_task: "1.1"
next_frontier_task: "1.2"
todo_window_mode_override: "inherit"
---
# Unit 1: Shared traversal policy
[INTENT: ANWEISUNG]

## Navigation
[INTENT: REFERENZ]

- **Parent Orchestration:** [`PLAN.md`](PLAN.md)
- **This Unit:** [`.plan/1-shared-traversal-policy/`](.plan/1-shared-traversal-policy)
- **Hierarchy Level:** 1
- **Unit Status:** `pending`
- **Progress:** 0/2 tasks

## Execution Frontier
[INTENT: REFERENZ]

- **Resume Frontier Task:** `1.1`
- **Next Frontier Task:** `1.2`
- **Todo Window Mode:** `inherit`
- **Read Scope Rule:** Read this orchestration file first, then execute task `1.1` before opening task `1.2`.

## Tasks
[INTENT: REFERENZ]

- [ ] **1.1 Establish shared traversal scope SSOT** → [`.plan/1-shared-traversal-policy/1.1-shared-traversal-scope-ssot.md`](.plan/1-shared-traversal-policy/1.1-shared-traversal-scope-ssot.md)
  - Classification: `ISOLATED`
  - Status: `pending`
  - Complexity: `MEDIUM`
  - Execution Surface Band: `GREEN`
  - Primary Split Axis: `none`
  - Files Modified: `src/domain/shared/guardrails/traversal-scope-policy.ts`
  - Blocked By: `none`
  - Summary: Create the central traversal policy surface that owns default excluded classes and explicit-root semantics for traversal-based endpoints.
- [ ] **1.2 Add secondary enrichment and traversal runtime guardrails** → [`.plan/1-shared-traversal-policy/1.2-secondary-enrichment-and-traversal-runtime-guardrails.md`](.plan/1-shared-traversal-policy/1.2-secondary-enrichment-and-traversal-runtime-guardrails.md)
  - Classification: `DEPENDENT`
  - Status: `pending`
  - Complexity: `HIGH`
  - Execution Surface Band: `YELLOW`
  - Primary Split Axis: `semantic_operation`
  - Files Modified: `src/domain/shared/guardrails/traversal-scope-policy.ts`, `src/domain/shared/guardrails/gitignore-traversal-enrichment.ts`, `src/domain/shared/guardrails/traversal-runtime-budget.ts`, `src/domain/shared/guardrails/tool-guardrail-limits.ts`, `src/domain/shared/guardrails/tool-guardrail-error-contract.ts`, `package.json`
  - Blocked By: `1.1`
  - Summary: Layer the optional `.gitignore` enrichment, additive re-include semantics, and traversal-budget refusal surfaces onto the shared traversal policy.

## Internal Dependencies (This Level)
[INTENT: REFERENZ]

| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| D1 | `1.2` | `1.1` | `SHARED_FILE` | `UNRESOLVED` | Task `1.2` extends the shared policy contract created in `1.1` and must not race the first task on the same policy surface. | `src/domain/shared/guardrails/traversal-scope-policy.ts` |

## Execution Order
[INTENT: REFERENZ]

1. Execute `1.1` first to establish the shared traversal policy SSOT.
2. Execute `1.2` after `1.1` completes and the shared policy surface is available for extension.

## Notes for Orchestrating Agent
[INTENT: KONTEXT]

- Preserve separation of concerns: traversal policy belongs to shared guardrails, while [`validatePath()`](src/infrastructure/filesystem/path-guard.ts:21) remains the low-level authorization boundary.
- Keep all new override controls additive and optional.
- Treat `.gitignore` as a secondary enrichment layer, not as the primary source of truth for traversal safety.
