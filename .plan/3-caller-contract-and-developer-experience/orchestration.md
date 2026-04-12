---
file_type: "orchestration"
file_id: "3"
unit_name: "Caller contract and developer experience"
parent_orchestration: "PLAN.md"
hierarchy_level: 1
unit_status: "pending"
total_tasks: 2
completed_tasks: 0
has_sub_units: false
sub_unit_count: 0
resume_frontier_task: "3.1"
next_frontier_task: "3.2"
todo_window_mode_override: "inherit"
---
# Unit 3: Caller contract and developer experience
[INTENT: ANWEISUNG]

## Navigation
[INTENT: REFERENZ]

- **Parent Orchestration:** [`PLAN.md`](PLAN.md)
- **This Unit:** [`.plan/3-caller-contract-and-developer-experience/`](.plan/3-caller-contract-and-developer-experience)
- **Hierarchy Level:** 1
- **Unit Status:** `pending`
- **Progress:** 0/2 tasks

## Execution Frontier
[INTENT: REFERENZ]

- **Resume Frontier Task:** `3.1`
- **Next Frontier Task:** `3.2`
- **Todo Window Mode:** `inherit`
- **Read Scope Rule:** Finish the caller-facing contract surface before broad developer-facing narrative work begins.

## Tasks
[INTENT: REFERENZ]

- [ ] **3.1 Schema, registration, and server contract updates** → [`.plan/3-caller-contract-and-developer-experience/3.1-schema-registration-and-server-contract-updates.md`](.plan/3-caller-contract-and-developer-experience/3.1-schema-registration-and-server-contract-updates.md)
  - Classification: `WAITING`
  - Status: `pending`
  - Complexity: `HIGH`
  - Execution Surface Band: `YELLOW`
  - Primary Split Axis: `artifact_family`
  - Files Modified: `src/application/server/register-inspection-tool-catalog.ts`, `src/application/server/server-instructions.ts`, `src/domain/inspection/list-directory-entries/schema.ts`, `src/domain/inspection/find-paths-by-name/schema.ts`, `src/domain/inspection/find-files-by-glob/schema.ts`, `src/domain/inspection/search-file-contents-by-regex/schema.ts`, `src/domain/inspection/count-lines/schema.ts`
  - Blocked By: `2.1.1`, `2.1.2`, `2.2.1`, `2.2.2`
  - Summary: Update the caller-visible contract so agents understand default excludes, explicit roots, additive re-includes, and optional `.gitignore` enrichment without reading implementation code.
- [ ] **3.2 TSDoc and developer-facing architecture documentation** → [`.plan/3-caller-contract-and-developer-experience/3.2-tsdoc-and-developer-experience-documentation.md`](.plan/3-caller-contract-and-developer-experience/3.2-tsdoc-and-developer-experience-documentation.md)
  - Classification: `SEQUENTIAL`
  - Status: `pending`
  - Complexity: `HIGH`
  - Execution Surface Band: `YELLOW`
  - Primary Split Axis: `artifact_family`
  - Files Modified: `README.md`, `DESCRIPTION.md`, `src/domain/shared/guardrails/traversal-scope-policy.ts`, `src/domain/shared/guardrails/gitignore-traversal-enrichment.ts`, `src/domain/shared/guardrails/traversal-runtime-budget.ts`
  - Blocked By: `3.1`
  - Summary: Document the architectural rationale, developer-experience goals, and TSDoc expectations for the new traversal policy and its risk-prevention behavior.

## Internal Dependencies (This Level)
[INTENT: REFERENZ]

| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| D1 | `3.2` | `3.1` | `SEQUENTIAL` | `UNRESOLVED` | Developer-facing documentation must be written after the public schema and instruction contract is finalized. | none |

## Execution Order
[INTENT: REFERENZ]

1. Complete `3.1` after Unit 2 finalizes the endpoint behavior.
2. Complete `3.2` after the caller contract is frozen so documentation reflects the implemented target state.

## Notes for Orchestrating Agent
[INTENT: KONTEXT]

- Keep caller-facing descriptions prompt-efficient: they must explain the new semantics without flooding the MCP tool surface.
- Ensure TSDoc and Markdown documentation explain both the prevented timeout/noise scenario and the preserved explicit access path for excluded trees.
