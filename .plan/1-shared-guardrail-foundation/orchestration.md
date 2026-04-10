---
file_type: "orchestration"
file_id: "1"
unit_name: "Shared Guardrail Foundation"
parent_orchestration: "../../PLAN.md"
hierarchy_level: 1
unit_status: "done"
total_tasks: 4
completed_tasks: 4
has_sub_units: false
sub_unit_count: 0
---

# Unit 1: Shared Guardrail Foundation

## Navigation
- **Parent Orchestration:** [`../../PLAN.md`](../../PLAN.md)
- **This Unit:** [`.plan/1-shared-guardrail-foundation/`](.)
- **Hierarchy Level:** 1
- **Unit Status:** done
- **Progress:** 4/4 tasks

## Tasks
- [x] **1.1 Shared Guardrail Limit Matrix and Error Contract** → [`1.1-shared-guardrail-limit-matrix-and-error-contract.md`](1.1-shared-guardrail-limit-matrix-and-error-contract.md)
   - Classification: `ISOLATED`
   - Status: `DONE`
   - Complexity: `HIGH`
  - Files Modified: `src/domain/shared/guardrails/tool-guardrail-limits.ts`, `src/domain/shared/guardrails/tool-guardrail-error-contract.ts`
  - Blocked By: `none`
  - Summary: Creates the single source of truth for cross-endpoint property classes, hard limits, endpoint family budgets, and canonical guardrail refusal messages.
- [x] **1.2 Shared Request Budget and Filesystem Preflight Helpers** → [`1.2-shared-request-budget-and-filesystem-preflight-helpers.md`](1.2-shared-request-budget-and-filesystem-preflight-helpers.md)
  - Classification: `SEQUENTIAL`
  - Status: `DONE`
  - Complexity: `HIGH`
  - Files Modified: `src/domain/shared/guardrails/text-response-budget.ts`, `src/domain/shared/guardrails/filesystem-preflight.ts`
  - Blocked By: `1.1`
  - Summary: Creates the reusable helpers that project text budgets from bytes, collect filesystem metadata, and reject oversize requests before content is read.
- [x] **1.3 Shared Regex Runtime Safety Helper** → [`1.3-shared-regex-runtime-safety-helper.md`](1.3-shared-regex-runtime-safety-helper.md)
   - Classification: `SEQUENTIAL`
   - Status: `DONE`
   - Complexity: `HIGH`
  - Files Modified: `src/domain/shared/guardrails/regex-search-safety.ts`
  - Blocked By: `1.1`
  - Summary: Establishes the shared runtime safety layer for regex compilation, zero-width rejection, result shaping, and search-density protection.
- [x] **1.4 Global Response Fuse Integration** → [`1.4-global-response-fuse-integration.md`](1.4-global-response-fuse-integration.md)
  - Classification: `SEQUENTIAL`
  - Status: `DONE`
  - Complexity: `MEDIUM`
  - Files Modified: `src/application/server/filesystem-server.ts`
  - Blocked By: `none`
  - Summary: Integrates the final non-bypassable response-size fuse into the application-layer server shell so every tool result is subject to one final hard cap.

## Internal Dependencies (This Level)
| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| D1 | 1.1 | 1.2 | SEQUENTIAL | RESOLVED | The shared request-budget and filesystem-preflight helpers must import canonical limit constants and guardrail error builders from task 1.1. | `src/domain/shared/guardrails/tool-guardrail-limits.ts`, `src/domain/shared/guardrails/tool-guardrail-error-contract.ts` |
| D2 | 1.1 | 1.3 | SEQUENTIAL | RESOLVED | The regex runtime helper must reuse the canonical regex pattern limits and refusal message contract defined in task 1.1. | `src/domain/shared/guardrails/tool-guardrail-limits.ts`, `src/domain/shared/guardrails/tool-guardrail-error-contract.ts` |
| D3 | 1.2 | 1.4 | SEQUENTIAL | RESOLVED | The server-shell fuse must reuse the shared text-budget helper from task 1.2 rather than introducing duplicate size-estimation logic. | `src/domain/shared/guardrails/text-response-budget.ts`, `src/application/server/filesystem-server.ts` |
| D4 | 1.3 | 1.4 | SEQUENTIAL | RESOLVED | The final response fuse must align its rejection semantics with the regex runtime helper so global and endpoint-level refusals share one canonical error surface. | `src/domain/shared/guardrails/tool-guardrail-error-contract.ts`, `src/application/server/filesystem-server.ts` |

## Execution Order
1. Execute `1.1` first.
2. Execute `1.2` and `1.3` after `1.1`.
3. Execute `1.4` after both `1.2` and `1.3` are DONE.

## Notes for Orchestrating Agent
- This unit is the architectural root of the rollout. If a downstream task proposes endpoint-local constants that duplicate this unit, stop and normalize the design back into the shared foundation.
- Do not create a barrel file unless the imports demonstrably require one. Avoid unnecessary shared-file conflicts by importing directly from the canonical helper modules.
- The shared error contract must support deterministic refusal messages for schema rejects, handler preflight rejects, runtime search aborts, and global response-fuse aborts.
