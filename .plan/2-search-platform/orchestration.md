---
file_type: "orchestration"
file_id: "2"
unit_name: "Search Platform Refactoring"
parent_orchestration: "PLAN.md"
hierarchy_level: 1
unit_status: "in_progress"
total_tasks: 3
completed_tasks: 1
has_sub_units: false
sub_unit_count: 0
resume_frontier_task: "2.2"
next_frontier_task: "2.2"
todo_window_mode_override: "inherit"
---

# Unit 2: Search Platform Refactoring
[INTENT: CONTEXT]

## Navigation
[INTENT: REFERENZ]

- **Parent Orchestration:** [`PLAN.md`](../../PLAN.md)
- **This Unit:** `.plan/2-search-platform/`
- **Hierarchy Level:** 1
- **Unit Status:** in_progress
- **Progress:** 1/3 tasks

## Execution Frontier
[INTENT: REFERENZ]

- **Resume Frontier Task:** `2.1`
- **Next Frontier Task:** `2.2`
- **Todo Window Mode:** `inherit`
- **Read Scope Rule:** Read this orchestration file first, then the frontier task, then the explicit upstream references declared by that task.

## Tasks
[INTENT: REFERENZ]

- [x] **2.1 Introduce the shared ugrep adapter and classification surfaces** → [`2.1-ugrep-adapter-and-classification-surfaces.md`](./2.1-ugrep-adapter-and-classification-surfaces.md)
  - Classification: `ISOLATED`
  - Status: `DONE`
  - Complexity: `HIGH`
  - Execution Surface Band: `YELLOW`
  - Primary Split Axis: `none`
  - Files Modified: `src/infrastructure/search/ugrep-runner.ts`, `src/infrastructure/search/ugrep-command-builder.ts`, `src/domain/shared/search/text-binary-classifier.ts`, `src/domain/shared/search/pattern-classifier.ts`
  - Blocked By: `none`
  - Summary: Introduce the native search adapter and the classification primitives required by every later search consumer.
- [~] **2.2 Refactor the regex endpoint to the shared native search lane** → [`2.2-refactor-regex-endpoint-to-native-search.md`](./2.2-refactor-regex-endpoint-to-native-search.md)
  - Classification: `WAITING`
  - Status: `IN_PROGRESS`
  - Complexity: `HIGH`
  - Execution Surface Band: `YELLOW`
  - Primary Split Axis: `none`
  - Files Modified: `src/domain/inspection/search-file-contents-by-regex/handler.ts`, `src/domain/inspection/search-file-contents-by-regex/schema.ts`
  - Blocked By: `1.1`
  - Summary: Preserve the public regex contract while replacing the internal execution model with the shared native lane and preview/task semantics.
- [ ] **2.3 Add the new fixed-string search endpoint and register it** → [`2.3-add-fixed-string-search-endpoint-and-registration.md`](./2.3-add-fixed-string-search-endpoint-and-registration.md)
  - Classification: `SEQUENTIAL`
  - Status: `pending`
  - Complexity: `HIGH`
  - Execution Surface Band: `YELLOW`
  - Primary Split Axis: `none`
  - Files Modified: `src/domain/inspection/search-file-contents-by-fixed-string/schema.ts`, `src/domain/inspection/search-file-contents-by-fixed-string/handler.ts`, `src/application/server/register-inspection-tool-catalog.ts`
  - Blocked By: `2.2`
  - Summary: Add the new public fixed-string endpoint on top of the same shared native search backend and the same execution-policy vocabulary.

## Internal Dependencies (This Level)
[INTENT: REFERENZ]

| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| D2.1 | 2.2 | 2.1 | SEQUENTIAL | UNRESOLVED | The regex refactor must consume the shared native search adapter and classifiers created in task 2.1. | `none` |
| D2.2 | 2.3 | 2.2 | SEQUENTIAL | UNRESOLVED | The fixed-string endpoint should be registered only after the regex endpoint has established the final native search contract. | `src/application/server/register-inspection-tool-catalog.ts` |

## Execution Order
[INTENT: ANWEISUNG]

1. Execute `2.1`.
2. Wait for cross-unit dependency `1.1` to resolve, then execute `2.2`.
3. Execute `2.3` after `2.2` is done.

## Notes for Orchestrating Agent
[INTENT: CONSTRAINT]

- The public regex endpoint name stays unchanged.
- The new endpoint name must be `search_file_contents_by_fixed_string`.
- `ugrep` is the single primary search backend for all tasks in this unit.

