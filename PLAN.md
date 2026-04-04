---
file_type: "master"
file_id: "mcp-filesystem-extended-migration-modularization-plan"
plan_version: 1
created: "2026-04-03T00:00:00Z"
last_updated: "2026-04-03T00:00:00Z"
status: "done"
total_units: 4
completed_units: 4
total_tasks_all_levels: 15
completed_tasks_all_levels: 15
hierarchy_depth: 2
max_hierarchy_depth: 4
plan_directory: ".plan/"
---

# MCP Filesystem Extended Migration and Modularization Plan

## Navigation
- **Plan Directory:** `.plan/`
- **Total Units:** 4
- **Hierarchy Depth:** 2 levels
- **Overall Status:** done
- **Progress:** 15/15 tasks completed

## Units
- [x] **1. Domain Inspection Contract Ownership** → [`.plan/1-domain-inspection/orchestration.md`](.plan/1-domain-inspection/orchestration.md)
  - Classification: `ISOLATED`
  - Status: `done` | Tasks: 4 | Completed: 4
  - Summary: Move inspection output schemas and canonical result-contract ownership into the domain schema surfaces so the application layer stops duplicating tool result structure.
- [x] **2. Domain Comparison and Mutation Alignment** → [`.plan/2-domain-comparison-and-mutation/orchestration.md`](.plan/2-domain-comparison-and-mutation/orchestration.md)
  - Classification: `ISOLATED`
  - Status: `done` | Tasks: 3 | Completed: 3
  - Summary: Finish the remaining comparison and mutation migration work by aligning internal schema names, handler DTOs, and result wording with the direct target-state public tool surface.
- [x] **3. Application Server Composition and Tool-Catalog Decomposition** → [`.plan/3-application-server/orchestration.md`](.plan/3-application-server/orchestration.md)
  - Classification: `WAITING`
  - Status: `done` | Tasks: 4 | Completed: 4
  - Summary: Decompose the oversized application catalog into bounded registration modules that compose domain-owned contracts and keep only server-scope concerns in the application layer.
- [x] **4. Infrastructure, Documentation, and Delivery Verification** → [`.plan/4-infrastructure-and-delivery/orchestration.md`](.plan/4-infrastructure-and-delivery/orchestration.md)
  - Classification: `WAITING`
  - Status: `done` | Tasks: 4 | Completed: 4
  - Summary: Correct stale infrastructure leftovers, refresh documentation, add focused verification coverage, and close the migration with a final consistency pass.

## Cross-Unit Dependencies
| ID | Source | Target | Type | Status | Description | Shared Files |
|----|--------|--------|------|--------|-------------|--------------|
| D1 | 1-domain-inspection | 3-application-server | WAITING | RESOLVED | The application registration decomposition must consume domain-owned inspection output schemas instead of central catalog-local schema duplicates. | none |
| D2 | 2-domain-comparison-and-mutation | 3-application-server | WAITING | RESOLVED | The application registration split must import the finalized comparison and mutation schema and handler contracts after the remaining naming alignment is complete. | none |
| D3 | 3-application-server | 4-infrastructure-and-delivery | WAITING | RESOLVED | Documentation, tests, and delivery verification must target the final decomposed application topology and tool-catalog integration surface. | none |

## Legend

### Task States
| State | Symbol | Description | Can Transition To |
|-------|--------|-------------|-------------------|
| PENDING | [ ] | Not started | IN_PROGRESS, BLOCKED |
| IN_PROGRESS | [~] | Being worked on | DONE, BLOCKED |
| BLOCKED | [!] | Unresolved dependency | PENDING |
| WAITING | [W] | Cross-unit dependency | PENDING |
| DONE | [x] | Completed | VERIFIED |
| VERIFIED | [x] | Cross-verified | — (terminal) |

### Task Classification
| Classification | Description | Parallel | Sub-Agent |
|----------------|-------------|----------|-----------|
| ISOLATED | No cross-unit blocker or shared-file conflict exists at unit entry time | YES | YES |
| SEQUENTIAL | Ordered execution is required inside the same unit | NO | After predecessor |
| DEPENDENT | A shared file or shared contract surface requires serialized execution | CONDITIONAL | After conflict resolves |
| WAITING | A cross-unit blocker must resolve first | NO | After unblocked |

### Dependency Types
| Type | Description | Resolution |
|------|-------------|------------|
| WAITING | Target unit or task MUST be DONE first | Auto when target DONE |
| SEQUENTIAL | Source task in the same unit MUST be DONE first | Auto when source DONE |
| SHARED_FILE | Same file or same contract surface is modified by multiple tasks | Sequential execution plus re-anchor before the second write |

## Notes for Orchestrating Agent
- Start Units 1 and 2 first. They are the contract-ownership preparation phase and can run in parallel because they do not share modified files.
- Unit 3 is the application integration gate. Do not begin it until Units 1 and 2 are complete and their contract surfaces are stable.
- Unit 4 is the delivery-closeout phase. Run it only after Unit 3 has produced the final application topology that documentation, tests, and verification must describe.
- The target architecture is `application` for MCP transport orchestration, `domain` for tool-owned schemas and handlers, and `infrastructure` for technical capabilities such as path guards, metadata extraction, formatting, and logging.
- Under Domain-Driven Design, schema ownership belongs to the bounded context that owns the tool behavior. The application layer may compose those contracts but must not re-declare them as an alternate source of truth.
- Under the 12-Factor principle, the MCP server shell remains stateless, configuration-driven through allowed-directory inputs, and replaceable at the delivery boundary. Tool registration modules should therefore stay compositional and thin.
- Preserve the direct target-state migration strategy throughout execution: no compatibility shims, no parallel legacy names, and no reintroduction of a monolithic server-local schema catalog.
- Re-anchor affected source files before each existing-file modification boundary and after every shared-file or dependency handoff.
