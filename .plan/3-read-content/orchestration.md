---
file_type: "orchestration"
file_id: "3"
unit_name: "Read Content Architecture"
parent_orchestration: "PLAN.md"
hierarchy_level: 1
unit_status: "done"
total_tasks: 1
completed_tasks: 1
has_sub_units: false
sub_unit_count: 0
resume_frontier_task: "3.1"
next_frontier_task: "3.1"
todo_window_mode_override: "inherit"
---

# Unit 3: Read Content Architecture
[INTENT: CONTEXT]

## Navigation
[INTENT: REFERENZ]

- **Parent Orchestration:** [`PLAN.md`](../../PLAN.md)
- **This Unit:** `.plan/3-read-content/`
- **Hierarchy Level:** 1
- **Unit Status:** done
- **Progress:** 1/1 tasks

## Execution Frontier
[INTENT: REFERENZ]

- **Resume Frontier Task:** `3.1`
- **Next Frontier Task:** `3.1`
- **Todo Window Mode:** `inherit`
- **Read Scope Rule:** Start with this orchestration file and then read the task contract plus its authoritative references.

## Tasks
[INTENT: REFERENZ]

- [x] **3.1 Add the new `read_file_content` endpoint with streaming range and cursor modes** → [`3.1-add-read-file-content-endpoint-with-streaming-ranges.md`](./3.1-add-read-file-content-endpoint-with-streaming-ranges.md)
  - Classification: `WAITING`
  - Status: `DONE`
  - Complexity: `HIGH`
  - Execution Surface Band: `YELLOW`
  - Primary Split Axis: `none`
  - Files Modified: `src/domain/inspection/read-file-content/schema.ts`, `src/domain/inspection/read-file-content/handler.ts`, `src/infrastructure/filesystem/streaming-file-content-reader.ts`, `src/application/server/register-inspection-tool-catalog.ts`
  - Blocked By: `1.1`
  - Summary: Add the new content-read endpoint with bounded full-read, line-range, byte-range, and chunk-cursor modes on top of a streaming reader.

## Internal Dependencies (This Level)
[INTENT: REFERENZ]

| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| none | — | — | — | — | This unit has one waiting task that is unblocked by Unit 1 only. | — |

## Execution Order
[INTENT: ANWEISUNG]

1. Wait for task `1.1`.
2. Execute `3.1`.
3. Re-anchor [`PLAN.md`](../../PLAN.md) and this orchestration file after completion.

## Notes for Orchestrating Agent
[INTENT: CONSTRAINT]

- Do not use `ugrep` as the primary raw-content reader in this unit.
- Preserve the existing [`read_files_with_line_numbers`](src/application/server/register-inspection-tool-catalog.ts:83) endpoint as the bounded inline batch-read surface.

