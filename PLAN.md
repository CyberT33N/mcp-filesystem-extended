---
file_type: "master"
file_id: "filesystem-search-default-exclude-hardening"
plan_version: 1
created: "2026-04-12T00:00:00Z"
last_updated: "2026-04-12T00:00:00Z"
status: "pending"
total_units: 4
completed_units: 0
total_tasks_all_levels: 10
completed_tasks_all_levels: 0
hierarchy_depth: 3
max_hierarchy_depth: 4
plan_directory: ".plan/"
resume_frontier_unit: "1"
resume_frontier_task: "1.1"
next_frontier_task: "1.2"
todo_window_default: "ACTIVE_PLUS_NEXT"
---
# Search Traversal Default-Exclude Hardening Plan
[INTENT: KONTEXT]

---

## Navigation
[INTENT: REFERENZ]

- **Plan Directory:** [`.plan/`](.plan)
- **Total Units:** 4
- **Hierarchy Depth:** 3 levels
- **Overall Status:** `pending`
- **Progress:** 0/10 tasks completed

---

## Execution Frontier
[INTENT: REFERENZ]

- **Resume Frontier Unit:** `1`
- **Resume Frontier Task:** `1.1`
- **Next Frontier Task:** `1.2`
- **Todo Window Default:** `ACTIVE_PLUS_NEXT`
- **Frontier Rule:** Start with the shared traversal policy contract before any endpoint adoption, caller-facing contract update, or verification work begins.

---

## Units
[INTENT: REFERENZ]

- [ ] **1. Shared traversal policy** → [`.plan/1-shared-traversal-policy/orchestration.md`](.plan/1-shared-traversal-policy/orchestration.md)
  - Classification: `SEQUENTIAL`
  - Status: `pending` | Tasks: 2 | Completed: 0
  - Summary: Establish the server-owned traversal policy, optional `.gitignore` enrichment, explicit re-include semantics, and traversal-budget refusal surfaces.
- [ ] **2. Inspection endpoint adoption** → [`.plan/2-inspection-endpoint-adoption/orchestration.md`](.plan/2-inspection-endpoint-adoption/orchestration.md)
  - Classification: `WAITING`
  - Status: `pending` | Tasks: 4 | Completed: 0
  - Summary: Adopt the shared traversal policy across listing, name, glob, regex, and recursive line-count inspection surfaces without changing tool names or explicit-root access.
- [ ] **3. Caller contract and developer experience** → [`.plan/3-caller-contract-and-developer-experience/orchestration.md`](.plan/3-caller-contract-and-developer-experience/orchestration.md)
  - Classification: `WAITING`
  - Status: `pending` | Tasks: 2 | Completed: 0
  - Summary: Align schema descriptions, registration text, server instructions, README, DESCRIPTION, and TSDoc with the new traversal policy and agent-facing semantics.
- [ ] **4. Verification and rollout** → [`.plan/4-verification-and-rollout/orchestration.md`](.plan/4-verification-and-rollout/orchestration.md)
  - Classification: `WAITING`
  - Status: `pending` | Tasks: 2 | Completed: 0
  - Summary: Add automated verification coverage for the new traversal policy and execute rollout-readiness checks for the intentional default-scope hardening.

---

## Cross-Unit Dependencies
[INTENT: REFERENZ]

| ID | Source | Target | Type | Status | Description | Shared Files |
|----|--------|--------|------|--------|-------------|--------------|
| D1 | `2.1.1` | `1.2` | `WAITING` | `UNRESOLVED` | Listing and name-discovery adoption must wait until the shared policy, `.gitignore` enrichment, and explicit re-include contract are finalized. | none |
| D2 | `2.1.2` | `1.2` | `WAITING` | `UNRESOLVED` | Glob discovery adoption must consume the same finalized traversal contract instead of endpoint-local defaults. | none |
| D3 | `2.2.1` | `1.2` | `WAITING` | `UNRESOLVED` | Regex traversal must inherit the shared exclusion and explicit-override contract before handler-level changes begin. | none |
| D4 | `2.2.2` | `1.2` | `WAITING` | `UNRESOLVED` | Recursive line counting must not invent a separate traversal policy. | none |
| D5 | `3.1` | `2.1.1` | `WAITING` | `UNRESOLVED` | Caller-facing schema and registration text must reflect the implemented listing and name-discovery behavior. | none |
| D6 | `3.1` | `2.1.2` | `WAITING` | `UNRESOLVED` | Caller-facing schema and registration text must reflect the implemented glob-discovery behavior. | none |
| D7 | `3.1` | `2.2.1` | `WAITING` | `UNRESOLVED` | Caller-facing schema and registration text must reflect the implemented regex behavior and traversal-budget refusal semantics. | none |
| D8 | `3.1` | `2.2.2` | `WAITING` | `UNRESOLVED` | Caller-facing schema and registration text must reflect the implemented recursive count behavior. | none |
| D9 | `4.1` | `3.1` | `WAITING` | `UNRESOLVED` | Automated verification must target the finalized caller contract and server instructions. | none |
| D10 | `4.2` | `4.1` | `WAITING` | `UNRESOLVED` | Rollout-readiness checks must run after automated coverage is in place. | none |

---

## Legend
[INTENT: REFERENZ]

### Task States
| State | Symbol | Description | Can Transition To |
|-------|--------|-------------|-------------------|
| PENDING | [ ] | Not started | IN_PROGRESS, BLOCKED |
| IN_PROGRESS | [~] | Being worked on | DONE, BLOCKED |
| BLOCKED | [!] | Unresolved dependency | PENDING |
| WAITING | [W] | Cross-unit dependency | PENDING |
| DONE | [x] | Completed | VERIFIED |
| VERIFIED | [x] | Cross-verified | — |

### Task Classification
| Classification | Description | Parallel | Sub-Agent |
|----------------|-------------|----------|-----------|
| ISOLATED | No blocking dependency at the current hierarchy level | YES | YES |
| SEQUENTIAL | Ordered after an in-unit predecessor | NO | After predecessor |
| DEPENDENT | In-unit shared-file or tightly coupled follow-up | CONDITIONAL | After dependency resolves |
| WAITING | Cross-unit blocker must resolve first | NO | After unblocked |

### Dependency Types
| Type | Description | Resolution |
|------|-------------|------------|
| WAITING | Target must complete first | Auto when target DONE |
| SEQUENTIAL | Ordered in-unit predecessor | Auto when predecessor DONE |
| SHARED_FILE | Shared-file conflict or shared contract surface | Sequential execution and local re-anchor |

---

## Notes for Orchestrating Agent
[INTENT: KONTEXT]

- Preserve public tool names and keep low-level path authorization inside [`validatePath()`](src/infrastructure/filesystem/path-guard.ts:21).
- Treat default vendor/cache exclusion as an intentional behavior hardening requested by the user; do not silently dilute it back to caller-only opt-in exclusions.
- Preserve explicit access to excluded trees through explicit roots and additive caller override parameters rather than by reopening broad workspace traversal by default.
- Ensure the updated TSDoc and Markdown explanations tell developers and LLM agents why the new policy exists, what risk it prevents, and how explicit access still works.
