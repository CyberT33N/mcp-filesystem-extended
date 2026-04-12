---
file_type: "orchestration"
file_id: "2"
unit_name: "Inspection endpoint adoption"
parent_orchestration: "PLAN.md"
hierarchy_level: 1
unit_status: "pending"
total_tasks: 4
completed_tasks: 0
has_sub_units: true
sub_unit_count: 2
resume_frontier_task: "2.1.1"
next_frontier_task: "2.1.2"
todo_window_mode_override: "inherit"
---
# Unit 2: Inspection endpoint adoption
[INTENT: ANWEISUNG]

## Navigation
[INTENT: REFERENZ]

- **Parent Orchestration:** [`PLAN.md`](PLAN.md)
- **This Unit:** [`.plan/2-inspection-endpoint-adoption/`](.plan/2-inspection-endpoint-adoption)
- **Hierarchy Level:** 1
- **Unit Status:** `pending`
- **Progress:** 0/4 tasks

## Execution Frontier
[INTENT: REFERENZ]

- **Resume Frontier Task:** `2.1.1`
- **Next Frontier Task:** `2.1.2`
- **Todo Window Mode:** `inherit`
- **Read Scope Rule:** Read the active sub-unit orchestration file before opening any leaf task.

## Tasks and Sub-Units
[INTENT: REFERENZ]

- [ ] **2.1 Listing and name discovery** → [`.plan/2-inspection-endpoint-adoption/2.1-listing-and-name-discovery/orchestration.md`](.plan/2-inspection-endpoint-adoption/2.1-listing-and-name-discovery/orchestration.md)
  - Classification: `WAITING`
  - Status: `pending`
  - Complexity: `HIGH`
  - Execution Surface Band: `YELLOW`
  - Primary Split Axis: `semantic_operation`
  - Files Modified: `src/domain/inspection/list-directory-entries/*`, `src/domain/inspection/find-paths-by-name/*`, `src/domain/inspection/find-files-by-glob/*`
  - Blocked By: `1.2`
  - Summary: Move the listing, name, and glob discovery handlers to the shared traversal policy and unify their caller-facing traversal semantics.
- [ ] **2.2 Content and count surfaces** → [`.plan/2-inspection-endpoint-adoption/2.2-content-and-count-surfaces/orchestration.md`](.plan/2-inspection-endpoint-adoption/2.2-content-and-count-surfaces/orchestration.md)
  - Classification: `WAITING`
  - Status: `pending`
  - Complexity: `HIGH`
  - Execution Surface Band: `YELLOW`
  - Primary Split Axis: `semantic_operation`
  - Files Modified: `src/domain/inspection/search-file-contents-by-regex/*`, `src/domain/inspection/count-lines/*`
  - Blocked By: `1.2`
  - Summary: Apply the shared traversal policy to regex and recursive line-count operations, including the new traversal-budget refusal surfaces where needed.

## Internal Dependencies (This Level)
[INTENT: REFERENZ]

| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| D1 | `2.1` | `1.2` | `WAITING` | `UNRESOLVED` | Listing and name/glob adoption depend on the finalized shared traversal policy contract. | none |
| D2 | `2.2` | `1.2` | `WAITING` | `UNRESOLVED` | Regex and count-line adoption depend on the same shared traversal policy and optional enrichment contract. | none |

## Execution Order
[INTENT: REFERENZ]

1. Wait for Unit 1 to complete.
2. Execute sub-unit `2.1` and sub-unit `2.2` once the shared traversal policy is available.
3. Prioritize the listing and name-discovery sub-unit before the regex/count sub-unit if only one sub-unit can proceed at a time.

## Notes for Orchestrating Agent
[INTENT: KONTEXT]

- Do not duplicate traversal matching logic per endpoint; each leaf task must consume the shared guardrail modules created in Unit 1.
- Preserve explicit root access to excluded trees so vendor-focused tooling workflows remain possible.
- Keep registration and documentation changes out of this unit; they are owned by Unit 3.
