---
file_type: "orchestration"
file_id: "3"
unit_name: "Comparison and Mutation Hardening"
parent_orchestration: "../../PLAN.md"
hierarchy_level: 1
unit_status: "done"
total_tasks: 4
completed_tasks: 4
has_sub_units: false
sub_unit_count: 0
---

# Unit 3: Comparison and Mutation Hardening

## Navigation
- **Parent Orchestration:** [`../../PLAN.md`](../../PLAN.md)
- **This Unit:** [`.plan/3-comparison-and-mutation-hardening/`](.)
- **Hierarchy Level:** 1
- **Unit Status:** done
- **Progress:** 4/4 tasks

## Tasks
- [x] **3.1 Comparison Endpoint Guardrails** → [`3.1-comparison-endpoint-guardrails.md`](3.1-comparison-endpoint-guardrails.md)
  - Classification: `WAITING`
  - Status: `DONE`
  - Complexity: `HIGH`
  - Files Modified: `src/domain/comparison/diff-files/schema.ts`, `src/domain/comparison/diff-files/handler.ts`, `src/domain/comparison/diff-text-content/schema.ts`, `src/domain/comparison/diff-text-content/handler.ts`
  - Blocked By: `1.1, 1.2`
  - Summary: Adds request-surface caps and response-budget enforcement to file-diff and in-memory content-diff endpoints, with stricter limits for caller-supplied raw text.
- [x] **3.2 Content-Bearing Mutation Schema and Handler Guardrails** → [`3.2-content-bearing-mutation-schema-and-handler-guardrails.md`](3.2-content-bearing-mutation-schema-and-handler-guardrails.md)
  - Classification: `WAITING`
  - Status: `DONE`
  - Complexity: `HIGH`
  - Files Modified: `src/domain/mutation/create-files/schema.ts`, `src/domain/mutation/create-files/handler.ts`, `src/domain/mutation/append-files/schema.ts`, `src/domain/mutation/append-files/handler.ts`
  - Blocked By: `1.1, 1.2`
  - Summary: Hardens the create-files and append-files endpoints with canonical file-count limits, per-content caps, cumulative request budgets, and refusal messaging for oversize payloads.
- [x] **3.3 Line-Range Replacement Guardrails** → [`3.3-line-range-replacement-guardrails.md`](3.3-line-range-replacement-guardrails.md)
  - Classification: `WAITING`
  - Status: `DONE`
  - Complexity: `HIGH`
  - Files Modified: `src/domain/mutation/replace-file-line-ranges/schema.ts`, `src/domain/mutation/replace-file-line-ranges/handler.ts`, `src/domain/mutation/replace-file-line-ranges/helpers.ts`
  - Blocked By: `1.1, 1.2`
  - Summary: Adds file-count, replacement-count, and replacement-text caps plus preview/diff budget enforcement to the line-range replacement endpoint.
- [x] **3.4 Path Mutation Batch and Blast-Radius Guardrails** → [`3.4-path-mutation-batch-and-blast-radius-guardrails.md`](3.4-path-mutation-batch-and-blast-radius-guardrails.md)
   - Classification: `WAITING`
   - Status: `DONE`
   - Complexity: `HIGH`
  - Files Modified: `src/domain/mutation/create-directories/schema.ts`, `src/domain/mutation/create-directories/handler.ts`, `src/domain/mutation/delete-paths/schema.ts`, `src/domain/mutation/delete-paths/handler.ts`, `src/domain/mutation/move-paths/schema.ts`, `src/domain/mutation/move-paths/handler.ts`, `src/domain/mutation/copy-paths/schema.ts`, `src/domain/mutation/copy-paths/handler.ts`, `src/domain/mutation/copy-paths/helpers.ts`
  - Blocked By: `1.1`
  - Summary: Introduces hard batch-count and path-length caps for path-mutation endpoints, plus handler-level blast-radius checks that bound destructive or large-scale local filesystem operations.

## Internal Dependencies (This Level)
| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| D1 | 3.2 | 3.3 | SEQUENTIAL | RESOLVED | Both content-bearing mutation surfaces share the canonical raw-text budget semantics, so the line-range replacement rollout must align to the content-bearing mutation contract before finalizing replacement-specific caps. | `src/domain/shared/guardrails/tool-guardrail-limits.ts`, `src/domain/shared/guardrails/text-response-budget.ts` |

## Execution Order
1. Tasks `3.1`, `3.2`, and `3.4` may begin after their cross-unit blockers resolve.
2. Task `3.3` must execute after `3.2` because both surfaces share the same content-bearing budget semantics.

## Notes for Orchestrating Agent
- Mutation-family limits are primarily about blast radius and request payload budgets, not about large response content. Keep the response summaries concise and leave the heavy safety emphasis on request-side caps and handler refusal logic.
- `diff_text_content` is the strongest candidate for strict in-memory content caps because the caller can inject arbitrary text directly into the request surface.
- When any mutation handler adds new refusal logic, keep the wording deterministic and aligned to the shared guardrail error contract.
