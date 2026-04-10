---
file_type: "orchestration"
file_id: "4"
unit_name: "Contract Harmonization and Validation"
parent_orchestration: "../../PLAN.md"
hierarchy_level: 1
unit_status: "done"
total_tasks: 3
completed_tasks: 3
has_sub_units: false
sub_unit_count: 0
---

# Unit 4: Contract Harmonization and Validation

## Navigation
- **Parent Orchestration:** [`../../PLAN.md`](../../PLAN.md)
- **This Unit:** [`.plan/4-contract-harmonization-and-validation/`](.)
- **Hierarchy Level:** 1
- **Unit Status:** done
- **Progress:** 3/3 tasks

## Tasks
- [x] **4.1 Tool Registration and Server Instruction Harmonization** → [`4.1-tool-registration-and-server-instruction-harmonization.md`](4.1-tool-registration-and-server-instruction-harmonization.md)
  - Classification: `WAITING`
  - Status: `DONE`
  - Complexity: `MEDIUM`
  - Files Modified: `src/application/server/register-inspection-tool-catalog.ts`, `src/application/server/register-comparison-and-mutation-tool-catalog.ts`, `src/application/server/server-instructions.ts`, `src/application/server/server-description.ts`
  - Blocked By: `1.4, 2.5, 3.4`
  - Summary: Updates visible tool descriptions and server instructions so the MCP contract exposes the new hard caps, runtime refusal guidance, and family-specific usage expectations.
- [x] **4.2 TSDoc and Architecture Rationale Hardening** → [`4.2-tsdoc-and-architecture-rationale-hardening.md`](4.2-tsdoc-and-architecture-rationale-hardening.md)
   - Classification: `WAITING`
   - Status: `DONE`
    - Complexity: `HIGH`
   - Files Modified: `src/domain/shared/guardrails/**/*.ts`, `src/domain/inspection/**/*.ts`, `src/domain/comparison/**/*.ts`, `src/domain/mutation/**/*.ts`, `src/application/server/**/*.ts`
    - Blocked By: `1.4, 2.5, 3.4`
   - Summary: Adds the final TS-Docs that explain the LLM-oriented failure modes, the guardrail rationale, and the no-bypass contract for schemas, handlers, and shared guardrail helpers.
- [x] **4.3 Validation Matrix and Rollout Readiness Review** → [`4.3-validation-matrix-and-rollout-readiness-review.md`](4.3-validation-matrix-and-rollout-readiness-review.md)
  - Classification: `WAITING`
  - Status: `DONE`
  - Complexity: `MEDIUM`
  - Files Modified: `PLAN.md`, `.plan/**/*.md`
  - Blocked By: `4.2`
  - Summary: Performs the final cross-endpoint validation review, checks no-breaking-change constraints, and confirms that all family-specific limits and refusal modes are internally consistent.

## Internal Dependencies (This Level)
| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| D1 | 4.1 | 4.3 | SEQUENTIAL | RESOLVED | Final rollout validation must inspect the visible tool contract after descriptions and server instructions are aligned to the finished guardrail implementation. | `src/application/server/register-inspection-tool-catalog.ts`, `src/application/server/register-comparison-and-mutation-tool-catalog.ts`, `src/application/server/server-instructions.ts`, `src/application/server/server-description.ts` |
| D2 | 4.2 | 4.3 | SEQUENTIAL | RESOLVED | Final rollout validation must inspect the finished TSDoc surfaces after all rationale text and architectural explanations are in place. | `src/domain/shared/guardrails/**/*.ts`, `src/domain/inspection/**/*.ts`, `src/domain/comparison/**/*.ts`, `src/domain/mutation/**/*.ts`, `src/application/server/**/*.ts` |

## Execution Order
1. Execute `4.1` after Units 1–3 complete their relevant blockers.
2. Execute `4.2` after Units 1–3 complete their relevant blockers.
3. Execute `4.3` after both `4.1` and `4.2` are DONE.

## Notes for Orchestrating Agent
- Keep visible contract wording synchronized with the actual guardrail behavior. Descriptions must never imply that hard limits are caller-overridable when the implementation treats them as non-bypassable.
- TSDoc text must explain the architectural reason for each guardrail without adding provenance or migration history.
- The final validation task is not a placeholder. It must explicitly review every endpoint family against the agreed architecture: schema guards, handler preflights, runtime fuses, global response fuse, and no-breaking-change constraints.
