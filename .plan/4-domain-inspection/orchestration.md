---
file_type: "orchestration"
file_id: "4"
unit_name: "Domain Inspection"
parent_orchestration: "PLAN.md"
hierarchy_level: 1
unit_status: "pending"
total_tasks: 5
completed_tasks: 0
has_sub_units: true
sub_unit_count: 2
resume_frontier_task: "4.1.1"
next_frontier_task: "4.1.2"
todo_window_mode_override: "ACTIVE_PLUS_NEXT"
---

# Unit 4: Domain Inspection

## Tasks
- [ ] **4.1 Endpoint discovery and read surfaces** → `.plan/4-domain-inspection/4.1-endpoint-discovery-and-read-surfaces/orchestration.md`
  - Classification: `ISOLATED`
  - Status: `pending`
  - Summary: Covers the non-search inspection endpoint folders that discover paths, inspect metadata, count, checksum, and read file content.
- [ ] **4.2 Search families** → `.plan/4-domain-inspection/4.2-search-families/orchestration.md`
  - Classification: `WAITING`
  - Status: `pending`
  - Summary: Covers fixed-string and regex search families after the shared inspection fixture foundation exists.

