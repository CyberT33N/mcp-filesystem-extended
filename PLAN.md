---
file_type: "master"
file_id: "mcp-filesystem-extended-unit-test-coverage-plan"
plan_version: 2
created: "2026-01-05T20:22:00Z"
last_updated: "2026-01-05T20:22:00Z"
status: "in_progress"
total_units: 9
completed_units: 1
total_tasks_all_levels: 22
completed_tasks_all_levels: 1
hierarchy_depth: 3
max_hierarchy_depth: 4
plan_directory: ".plan/"
resume_frontier_unit: "4"
resume_frontier_task: "4.2.1"
next_frontier_task: "4.2.2"
todo_window_default: "ACTIVE_PLUS_NEXT"
---

# MCP Filesystem Extended - Unit-Test Coverage Plan

## Navigation
- **Plan Directory:** `.plan/`
- **Total Units:** 9
- **Hierarchy Depth:** 3 levels
- **Overall Status:** in_progress
- **Progress:** 1/22 tasks completed

## Execution Frontier
- **Resume Frontier Unit:** `4`
- **Resume Frontier Task:** `4.2.1`
- **Next Frontier Task:** `4.2.2`
- **Todo Window Default:** `ACTIVE_PLUS_NEXT`
- **Frontier Rule:** First establish the shared inspection fixture foundation, then advance into the application and domain coverage slices.

## Testing Governance Anchors
- **Source/Test placement:** Mirror `src/**` into `test/unit/**`; use the matching subtree and stable basename conventions for each runtime unit-test surface.
- **White-box default:** Prefer direct tests for project-owned handlers, helpers, guards, classifiers, mappers, and formatter logic. Do not rely on black-box-only coverage for internal behavior.
- **No kitchen-sink tests:** One independent expectation or collaboration reason to fail per `it`; centralize only truly identical arrange/setup via `beforeEach`.
- **Zod schema strategy:** Test schema semantics directly (`safeParse`/`parse`, defaults, coercion, refine/superRefine, strictness) and test only project-owned error mapping in runtime handler paths.
- **Snapshot policy:** No unit-test snapshots as the primary regression mechanism for schema or handler surfaces. Use snapshots only for explicit regression artifacts such as governed fixtures; the REST/OpenAPI snapshot rules are informative only and are not a primary contract surface for this MCP server.

## Units
- [x] **1. Shared Test Foundation** → `.plan/1-shared-test-foundation/orchestration.md`
  - Classification: `ISOLATED`
  - Status: `done` | Tasks: 1 | Completed: 1
  - Summary: Establishes shared search-fixture and assertion infrastructure so the inspection search families do not duplicate inline test data.
- [ ] **2. Application and Entry Composition** → `.plan/2-application-and-entrypoints/orchestration.md`
  - Classification: `ISOLATED`
  - Status: `pending` | Tasks: 2 | Completed: 0
  - Summary: Covers server composition, tool registration, public entry wiring, and instruction/description surfaces without touching config or bootstrap.
- [ ] **3. Domain Comparison** → `.plan/3-domain-comparison/orchestration.md`
  - Classification: `ISOLATED`
  - Status: `pending` | Tasks: 1 | Completed: 0
  - Summary: Adds unit coverage for diff endpoint families and their request/response schema semantics.
- [ ] **4. Domain Inspection** → `.plan/4-domain-inspection/orchestration.md`
  - Classification: `MIXED`
  - Status: `pending` | Tasks: 5 | Completed: 0
  - Summary: Covers the inspection endpoint families, including filesystem discovery, count/checksum, read surfaces, and the two search families.
- [ ] **5. Domain Mutation** → `.plan/5-domain-mutation/orchestration.md`
  - Classification: `ISOLATED`
  - Status: `pending` | Tasks: 2 | Completed: 0
  - Summary: Covers mutation endpoint families and the shared mutation guardrails surface.
- [ ] **6. Domain Shared** → `.plan/6-domain-shared/orchestration.md`
  - Classification: `MIXED`
  - Status: `pending` | Tasks: 5 | Completed: 0
  - Summary: Covers continuation/resume contracts, shared guardrail policies, traversal policy surfaces, shared search policy kernels, and the runtime capability profile contract.
- [ ] **7. Infrastructure** → `.plan/7-infrastructure/orchestration.md`
  - Classification: `MIXED`
  - Status: `pending` | Tasks: 4 | Completed: 0
  - Summary: Covers filesystem helpers, streaming read cores, persistence stores, runtime detectors, formatters, loggers, and native search adapters.
- [ ] **8. Shared Errors** → `.plan/8-shared-errors/orchestration.md`
  - Classification: `ISOLATED`
  - Status: `pending` | Tasks: 1 | Completed: 0
  - Summary: Covers error export aggregation, abort classification, normalization surfaces, and the public root entrypoint.
- [ ] **9. Build Gating** → `.plan/9-build-gating/orchestration.md`
  - Classification: `WAITING`
  - Status: `pending` | Tasks: 1 | Completed: 0
  - Summary: Gates the package build lifecycle so deterministic tests run before `build` and the build continues only on test success.

## Cross-Unit Dependencies
| ID | Source | Target | Type | Status | Description | Shared Files |
|----|--------|--------|------|--------|-------------|--------------|
| D1 | `1.1` | `4.2.1` | `WAITING` | `RESOLVED` | The fixed-string search family must consume the shared fixture registry, fixture loader, and result assertions from the shared test foundation before final endpoint-family coverage is added. | `test/shared/utils/inspection/search-fixture-registry.ts`, `test/shared/utils/inspection/search-fixture-loader.ts`, `test/shared/utils/inspection/search-result-assertions.ts` |
| D2 | `1.1` | `4.2.2` | `WAITING` | `RESOLVED` | The regex search family must consume the same shared inspection fixture foundation to avoid inline duplicated search fixtures and assertion helpers. | `test/shared/utils/inspection/search-fixture-registry.ts`, `test/shared/utils/inspection/search-fixture-loader.ts`, `test/shared/utils/inspection/search-result-assertions.ts` |
| D3 | `8.1` | `9.1` | `WAITING` | `UNRESOLVED` | The build-gating manifest change must follow the main test-coverage rollout so the new build precondition references the intended deterministic suite surface. | `package.json` |

## Notes for Orchestrating Agent
- Ignore config, bootstrap, and boilerplate surfaces as requested by the user.
- Preserve and extend existing tests instead of replacing them where a mirrored test surface already exists.
- Keep the runtime unit-test tree in `test/unit/**`; use selective `test/fixtures/**` and `test/shared/utils/**` only when multiple tests truly share the same reusable data or assertion logic.
- For schema-heavy endpoint folders, use a hybrid approach: runtime unit tests for project-owned handler logic and schema semantics tests for the exported Zod contracts; snapshots are not the primary unit-test regression tool.
- Keep the package build tool binding `build: tsup` unchanged; enforce build gating through a deterministic package lifecycle test gate in Unit 9 instead of through a watch-mode test script.

## Legend

### Task States
| State | Symbol | Description |
|-------|--------|-------------|
| PENDING | [ ] | Not started |
| IN_PROGRESS | [~] | Being worked on |
| BLOCKED | [!] | Blocked by another task |
| WAITING | [W] | Waiting on a cross-unit dependency |
| DONE | [x] | Completed |

### Task Classification
| Classification | Description |
|----------------|-------------|
| ISOLATED | No blocking dependency on siblings or other units |
| WAITING | Cross-unit blocker must complete first |
