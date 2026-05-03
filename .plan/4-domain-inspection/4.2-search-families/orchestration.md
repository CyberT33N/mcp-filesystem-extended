---
file_type: "orchestration"
file_id: "4.2"
unit_name: "Search Families"
parent_orchestration: ".plan/4-domain-inspection/orchestration.md"
hierarchy_level: 2
unit_status: "done"
total_tasks: 2
completed_tasks: 2
has_sub_units: false
sub_unit_count: 0
resume_frontier_task: "4.2.2"
next_frontier_task: "4.2.2"
todo_window_mode_override: "ACTIVE_PLUS_NEXT"
---

# Unit 4.2: Search Families

## Tasks
- [x] **4.2.1 Fixed-string search family tests** → `4.2.1-fixed-string-search-family-tests.md`
  - Classification: `ISOLATED`
  - Blocked By: `none`
  - Summary: Extends the fixed-string endpoint test and adds mirrored support-surface tests that consume the shared fixture foundation.
- [x] **4.2.2 Regex search family tests** → `4.2.2-regex-search-family-tests.md`
  - Classification: `ISOLATED`
  - Blocked By: `none`
  - Summary: Extends the regex endpoint test and adds mirrored support-surface tests that consume the shared fixture foundation.

## Internal Dependencies
| ID | Source Task | Target Task | Type | Status | Description |
|----|------------|-------------|------|--------|-------------|
| — | — | — | — | — | No internal sibling dependency; both tasks are unblocked now that the shared fixture foundation is done. |
