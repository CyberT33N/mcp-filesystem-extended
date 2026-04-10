---
file_type: "orchestration"
file_id: "2"
unit_name: "Inspection Endpoint Hardening"
parent_orchestration: "../../PLAN.md"
hierarchy_level: 1
unit_status: "done"
total_tasks: 5
 completed_tasks: 5
has_sub_units: false
sub_unit_count: 0
---

# Unit 2: Inspection Endpoint Hardening

## Navigation
- **Parent Orchestration:** [`../../PLAN.md`](../../PLAN.md)
- **This Unit:** [`.plan/2-inspection-endpoint-hardening/`](.)
- **Hierarchy Level:** 1
- **Unit Status:** done
- **Progress:** 5/5 tasks

## Tasks
- [x] **2.1 Inspection Metadata, Discovery, Count, and Checksum Guardrails** → [`2.1-inspection-metadata-discovery-count-and-checksum-guardrails.md`](2.1-inspection-metadata-discovery-count-and-checksum-guardrails.md)
  - Classification: `WAITING`
  - Status: `DONE`
  - Complexity: `HIGH`
  - Files Modified: `src/domain/inspection/list-directory-entries/schema.ts`, `src/domain/inspection/list-directory-entries/handler.ts`, `src/domain/inspection/get-path-metadata/schema.ts`, `src/domain/inspection/find-paths-by-name/schema.ts`, `src/domain/inspection/find-paths-by-name/handler.ts`, `src/domain/inspection/find-paths-by-name/helpers.ts`, `src/domain/inspection/find-files-by-glob/schema.ts`, `src/domain/inspection/find-files-by-glob/handler.ts`, `src/domain/inspection/count-lines/schema.ts`, `src/domain/inspection/count-lines/handler.ts`, `src/domain/inspection/get-file-checksums/schema.ts`, `src/domain/inspection/get-file-checksums/handler.ts`, `src/domain/inspection/verify-file-checksums/schema.ts`, `src/domain/inspection/verify-file-checksums/handler.ts`
  - Blocked By: `1.1`
  - Summary: Applies canonical property-class caps and output-budget governance to all non-read, non-regex inspection endpoints, including optional truncation fields where result fan-out can still grow too large.
- [x] **2.2 Read Files Schema Guardrails** → [`2.2-read-files-schema-guardrails.md`](2.2-read-files-schema-guardrails.md)
  - Classification: `WAITING`
  - Status: `DONE`
  - Complexity: `MEDIUM`
  - Files Modified: `src/domain/inspection/read-files-with-line-numbers/schema.ts`
  - Blocked By: `1.1`
  - Summary: Adds non-breaking but hard request-surface caps for the direct file-read tool, with a high anti-abuse `paths` ceiling and canonical path-length constraints.
- [x] **2.3 Read Files Handler Preflight and Budget Enforcement** → [`2.3-read-files-handler-preflight-and-budget-enforcement.md`](2.3-read-files-handler-preflight-and-budget-enforcement.md)
   - Classification: `WAITING`
   - Status: `DONE`
   - Complexity: `HIGH`
   - Files Modified: `src/domain/inspection/read-files-with-line-numbers/handler.ts`
   - Blocked By: `1.2, 2.2`
   - Summary: Introduces metadata-first admission control, projected line-numbered response estimation, and deterministic refusal behavior before full file reads occur.
- [x] **2.4 Regex Search Schema Guardrails** → [`2.4-regex-search-schema-guardrails.md`](2.4-regex-search-schema-guardrails.md)
  - Classification: `WAITING`
  - Status: `DONE`
  - Complexity: `MEDIUM`
  - Files Modified: `src/domain/inspection/search-file-contents-by-regex/schema.ts`
  - Blocked By: `1.1`
  - Summary: Hardens the regex search request surface with canonical limits for roots, globs, regex length, and `maxResults`, while preserving non-breaking defaults and optionality.
- [x] **2.5 Regex Search Handler Runtime Guardrails** → [`2.5-regex-search-handler-runtime-guardrails.md`](2.5-regex-search-handler-runtime-guardrails.md)
  - Classification: `WAITING`
  - Status: `DONE`
  - Complexity: `HIGH`
  - Files Modified: `src/domain/inspection/search-file-contents-by-regex/handler.ts`
  - Blocked By: `1.2, 1.3, 2.4`
  - Summary: Adds low-false-positive runtime safety for regex execution, including empty-pattern rejection, zero-width aborts, candidate-scope budgets, line-snippet shaping, and response-size enforcement.

## Internal Dependencies (This Level)
| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| D1 | 2.2 | 2.3 | SEQUENTIAL | RESOLVED | The read-files handler must implement exactly the schema-level contract decided in task 2.2, including the canonical `paths` ceiling and path-string limit. | `src/domain/inspection/read-files-with-line-numbers/schema.ts`, `src/domain/inspection/read-files-with-line-numbers/handler.ts` |
| D2 | 2.4 | 2.5 | SEQUENTIAL | RESOLVED | The regex handler must align to the exact schema contract from task 2.4 so runtime shaping never drifts from request-surface guarantees. | `src/domain/inspection/search-file-contents-by-regex/schema.ts`, `src/domain/inspection/search-file-contents-by-regex/handler.ts` |

## Execution Order
1. Tasks `2.1`, `2.2`, and `2.4` may begin after their cross-unit blockers are resolved.
2. Task `2.3` must execute after `2.2` and its shared-foundation blockers.
3. Task `2.5` must execute after `2.4` and its shared-foundation blockers.

## Notes for Orchestrating Agent
- Do not introduce a broad regex blacklist. The runtime safety model must prefer structural runtime rejection and budget enforcement over content-based prohibition lists.
- `read_files_with_line_numbers` is the inspection endpoint with the strongest pre-read metadata requirement. The handler must compute projected response size before any bulk `fs.readFile` loop begins.
- Where truncation metadata is added to structured outputs, keep the change non-breaking by extending result shapes rather than renaming or removing existing fields.
