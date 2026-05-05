---
file_type: "orchestration"
file_id: "6.1"
unit_name: "Resume and Guardrail Policies"
parent_orchestration: ".plan/6-domain-shared/orchestration.md"
hierarchy_level: 2
unit_status: "done"
total_tasks: 3
completed_tasks: 3
has_sub_units: false
sub_unit_count: 0
resume_frontier_task: "6.2.1"
next_frontier_task: "6.2.2"
todo_window_mode_override: "ACTIVE_PLUS_NEXT"
---

# Unit 6.1: Resume and Guardrail Policies

## Tasks
- [x] **6.1.1 Continuation and resume contract tests** → `6.1.1-continuation-and-resume-contract-tests.md`
  - Classification: `ISOLATED`
  - Status: `done`
  - Summary: Covers continuation admission envelopes, resume-only request validation, and traversal-frame helper behavior for the shared continuation and resume contract family.
- [x] **6.1.2 Guardrail policy surface tests** → `6.1.2-guardrail-policy-surface-tests.md`
  - Classification: `ISOLATED`
  - Status: `done`
  - Summary: Covers filesystem preflight, regex-search safety, text response budgets, tool guardrail error contracts, limit contracts, and gitignore traversal enrichment.
- [x] **6.1.3 Traversal policy surface tests** → `6.1.3-traversal-policy-surface-tests.md`
  - Classification: `ISOLATED`
  - Status: `done`
  - Summary: Covers traversal workload sizing, preview-lane behavior, runtime budget shaping, scope policy rules, and workload admission decisions.
