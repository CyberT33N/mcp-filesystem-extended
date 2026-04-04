---
file_type: "orchestration"
file_id: "2-domain-comparison-and-mutation"
unit_name: "Domain Comparison and Mutation Alignment"
parent_orchestration: "../../PLAN.md"
hierarchy_level: 1
unit_status: "done"
 total_tasks: 3
completed_tasks: 3
 has_sub_units: false
sub_unit_count: 0
---

# Unit 2: Domain Comparison and Mutation Alignment

## Navigation
- **Parent Orchestration:** [`PLAN.md`](../../PLAN.md)
- **This Unit:** `.plan/2-domain-comparison-and-mutation/`
- **Hierarchy Level:** 1
- **Unit Status:** done
- **Progress:** 3/3 tasks

## Tasks
- [x] **2.1 Comparison handler and contract normalization** → [`2.1-comparison-handler-and-contract-normalization.md`](./2.1-comparison-handler-and-contract-normalization.md)
  - Classification: `ISOLATED`
  - Status: `DONE`
  - Complexity: `MEDIUM`
  - Files Modified: `src/domain/comparison/diff-files/handler.ts`, `src/domain/comparison/diff-files/schema.ts`, `src/domain/comparison/diff-text-content/handler.ts`, `src/domain/comparison/diff-text-content/schema.ts`
  - Blocked By: `none`
  - Summary: Normalize comparison-domain internal DTO names, schema descriptions, and result wording so they match the direct target-state public tool surface without changing comparison behavior.
- [x] **2.2 Mutation handler and helper normalization** → [`2.2-mutation-handler-and-helper-normalization.md`](./2.2-mutation-handler-and-helper-normalization.md)
  - Classification: `ISOLATED`
  - Status: `DONE`
  - Complexity: `HIGH`
  - Files Modified: `src/domain/mutation/append-files/handler.ts`, `src/domain/mutation/append-files/schema.ts`, `src/domain/mutation/copy-paths/handler.ts`, `src/domain/mutation/copy-paths/helpers.ts`, `src/domain/mutation/copy-paths/schema.ts`, `src/domain/mutation/create-directories/handler.ts`, `src/domain/mutation/create-directories/schema.ts`, `src/domain/mutation/create-files/handler.ts`, `src/domain/mutation/create-files/schema.ts`, `src/domain/mutation/delete-paths/handler.ts`, `src/domain/mutation/delete-paths/schema.ts`, `src/domain/mutation/move-paths/handler.ts`, `src/domain/mutation/move-paths/schema.ts`, `src/domain/mutation/replace-file-line-ranges/handler.ts`, `src/domain/mutation/replace-file-line-ranges/helpers.ts`, `src/domain/mutation/replace-file-line-ranges/schema.ts`
  - Blocked By: `none`
  - Summary: Remove stale legacy naming and migration leftovers from mutation handlers and helpers so each domain module speaks the target-state contract language used by the public tool surface.
- [x] **2.3 Comparison and mutation final handoff normalization** → [`2.3-comparison-and-mutation-final-handoff-normalization.md`](./2.3-comparison-and-mutation-final-handoff-normalization.md)
  - Classification: `SEQUENTIAL`
  - Status: `DONE`
  - Complexity: `HIGH`
  - Files Modified: `src/domain/comparison/diff-files/handler.ts`, `src/domain/comparison/diff-files/schema.ts`, `src/domain/comparison/diff-text-content/handler.ts`, `src/domain/comparison/diff-text-content/schema.ts`, `src/domain/mutation/append-files/handler.ts`, `src/domain/mutation/copy-paths/handler.ts`, `src/domain/mutation/copy-paths/helpers.ts`, `src/domain/mutation/create-directories/handler.ts`, `src/domain/mutation/create-files/handler.ts`, `src/domain/mutation/delete-paths/handler.ts`, `src/domain/mutation/move-paths/handler.ts`, `src/domain/mutation/replace-file-line-ranges/handler.ts`, `src/domain/mutation/replace-file-line-ranges/helpers.ts`
  - Blocked By: `2.1, 2.2`
  - Summary: Perform the final cross-surface normalization needed to hand off stable comparison and mutation modules to the decomposed application registration layer without leaving partial legacy terminology behind.

## Internal Dependencies (This Level)
| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| D1 | 2.1 | 2.3 | SHARED_FILE | RESOLVED | The final handoff normalization must run after comparison normalization because both tasks modify the same comparison handler and schema files. | `src/domain/comparison/diff-files/handler.ts`, `src/domain/comparison/diff-files/schema.ts`, `src/domain/comparison/diff-text-content/handler.ts`, `src/domain/comparison/diff-text-content/schema.ts` |
| D2 | 2.2 | 2.3 | SHARED_FILE | RESOLVED | The final handoff normalization must run after mutation normalization because both tasks modify the same mutation handlers and helpers. | `src/domain/mutation/append-files/handler.ts`, `src/domain/mutation/copy-paths/handler.ts`, `src/domain/mutation/copy-paths/helpers.ts`, `src/domain/mutation/create-directories/handler.ts`, `src/domain/mutation/create-files/handler.ts`, `src/domain/mutation/delete-paths/handler.ts`, `src/domain/mutation/move-paths/handler.ts`, `src/domain/mutation/replace-file-line-ranges/handler.ts`, `src/domain/mutation/replace-file-line-ranges/helpers.ts` |

## Execution Order
1. Run `2.1` and `2.2` in any order or in parallel because they do not share modified files.
2. Re-anchor all touched comparison and mutation files after `2.1` and `2.2` are complete.
3. Run `2.3` only after both predecessor tasks are done and the shared files listed in the dependency table have been refreshed.

## Notes for Orchestrating Agent
- This unit is still part of the domain-side migration. Do not move registration code into the application layer from here.
- Focus on contract-language consistency, handler naming consistency, and removal of migration leftovers such as stale legacy helper names or obsolete user-facing wording.
- Preserve operational behavior: file operations, diff generation, and patching logic must remain behaviorally equivalent while internal naming and contract surfaces are aligned.
- Unit 3 depends on the outputs of this unit. The goal is a clean domain handoff surface that the application registration modules can import without additional adapter naming layers.
- Before `2.3` executes, re-read every shared file listed in `D1` and `D2` to avoid stale assumptions during the final normalization sweep.
