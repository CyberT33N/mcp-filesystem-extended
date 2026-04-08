---
file_type: "master"
file_id: "mcp-filesystem-extended-guardrail-hardening-plan"
plan_version: 1
created: "2026-04-08T00:00:00Z"
last_updated: "2026-04-08T00:00:00Z"
status: "pending"
total_units: 4
completed_units: 0
total_tasks_all_levels: 16
completed_tasks_all_levels: 0
hierarchy_depth: 2
max_hierarchy_depth: 4
plan_directory: ".plan/"
---

# MCP Filesystem Extended Guardrail Hardening Plan

## Navigation
- **Plan Directory:** [`.plan/`](.plan/)
- **Total Units:** 4
- **Hierarchy Depth:** 2 levels
- **Overall Status:** pending
- **Progress:** 0/16 tasks completed

## Units
- [ ] **1. Shared Guardrail Foundation** → [`.plan/1-shared-guardrail-foundation/orchestration.md`](.plan/1-shared-guardrail-foundation/orchestration.md)
  - Classification: `SEQUENTIAL`
  - Status: `pending` | Tasks: 4 | Completed: 0
  - Summary: Establishes the canonical guardrail constants, shared helper surfaces, regex-safety primitives, and the global response fuse used by all endpoint families.
- [ ] **2. Inspection Endpoint Hardening** → [`.plan/2-inspection-endpoint-hardening/orchestration.md`](.plan/2-inspection-endpoint-hardening/orchestration.md)
  - Classification: `WAITING`
  - Status: `pending` | Tasks: 5 | Completed: 0
  - Summary: Hardens the read, regex-search, metadata, discovery, counting, and checksum endpoints with schema caps, metadata preflights, runtime result budgets, and low-false-positive search controls.
- [ ] **3. Comparison and Mutation Hardening** → [`.plan/3-comparison-and-mutation-hardening/orchestration.md`](.plan/3-comparison-and-mutation-hardening/orchestration.md)
  - Classification: `WAITING`
  - Status: `pending` | Tasks: 4 | Completed: 0
  - Summary: Applies request and response guardrails to diff, content-bearing mutation, line-range replacement, and path-mutation endpoint families without introducing breaking changes.
- [ ] **4. Contract Harmonization and Validation** → [`.plan/4-contract-harmonization-and-validation/orchestration.md`](.plan/4-contract-harmonization-and-validation/orchestration.md)
  - Classification: `WAITING`
  - Status: `pending` | Tasks: 3 | Completed: 0
  - Summary: Aligns visible tool descriptions and TS-Docs with the implemented safety model and performs the final validation review for contract consistency and rollout readiness.

## Cross-Unit Dependencies
| ID | Source | Target | Type | Status | Description | Shared Files |
|----|--------|--------|------|--------|-------------|--------------|
| D1 | 1.1 | 2.1 | WAITING | UNRESOLVED | Shared property classes, request caps, and guardrail error semantics must exist before the broader inspection-family rollout can bind to one canonical limit matrix. | `src/domain/shared/guardrails/tool-guardrail-limits.ts`, `src/domain/shared/guardrails/tool-guardrail-error-contract.ts` |
| D2 | 1.1 | 2.2 | WAITING | UNRESOLVED | The read-files schema must reuse the canonical path, batch-count, and content-size policy from the shared foundation. | `src/domain/shared/guardrails/tool-guardrail-limits.ts` |
| D3 | 1.2 | 2.3 | WAITING | UNRESOLVED | The read-files handler requires the shared filesystem metadata preflight and projected response estimator before endpoint-specific enforcement can be implemented. | `src/domain/shared/guardrails/filesystem-preflight.ts`, `src/domain/shared/guardrails/text-response-budget.ts` |
| D4 | 1.1 | 2.4 | WAITING | UNRESOLVED | The regex-search schema must bind to the canonical regex, glob, path, and max-results contract surfaces defined in the shared foundation. | `src/domain/shared/guardrails/tool-guardrail-limits.ts` |
| D5 | 1.3 | 2.5 | WAITING | UNRESOLVED | The regex handler requires the shared runtime zero-width protection and search-shaping helper before endpoint-specific search orchestration can be hardened. | `src/domain/shared/guardrails/regex-search-safety.ts` |
| D6 | 1.1 | 3.1 | WAITING | UNRESOLVED | Comparison-family request and response limits must be derived from the shared limit matrix rather than introducing endpoint-local literals. | `src/domain/shared/guardrails/tool-guardrail-limits.ts` |
| D7 | 1.1 | 3.2 | WAITING | UNRESOLVED | Content-bearing mutation endpoints must reuse canonical content-length and batch-count limits to avoid drift across creation, append, and replacement surfaces. | `src/domain/shared/guardrails/tool-guardrail-limits.ts` |
| D8 | 1.2 | 3.3 | WAITING | UNRESOLVED | The line-range replacement endpoint requires the shared text budget helpers to bound replacement previews and diff payloads. | `src/domain/shared/guardrails/text-response-budget.ts` |
| D9 | 1.1 | 3.4 | WAITING | UNRESOLVED | Path mutation batch caps and blast-radius decisions must inherit from the canonical batch guardrail policy. | `src/domain/shared/guardrails/tool-guardrail-limits.ts` |
| D10 | 1.4 | 4.1 | WAITING | UNRESOLVED | Tool descriptions and server instructions must reflect the final non-bypassable server-shell response fuse and the canonical guardrail behavior exposed to callers. | `src/application/server/filesystem-server.ts`, `src/application/server/register-inspection-tool-catalog.ts`, `src/application/server/register-comparison-and-mutation-tool-catalog.ts`, `src/application/server/server-instructions.ts` |
| D11 | 2.5 | 4.1 | WAITING | UNRESOLVED | Regex endpoint descriptions cannot be finalized until the runtime guardrail behavior, low-false-positive guidance, and reject messaging are concretely defined. | `src/application/server/register-inspection-tool-catalog.ts`, `src/domain/inspection/search-file-contents-by-regex/handler.ts` |
| D12 | 3.4 | 4.1 | WAITING | UNRESOLVED | Mutation-family descriptions must disclose the final operation-count and blast-radius limits after the path-mutation hardening is complete. | `src/application/server/register-comparison-and-mutation-tool-catalog.ts` |
| D13 | 2.5 | 4.2 | WAITING | UNRESOLVED | TSDoc content for regex guardrails must describe the final low-false-positive runtime safety model rather than a provisional design. | `src/domain/inspection/search-file-contents-by-regex/schema.ts`, `src/domain/inspection/search-file-contents-by-regex/handler.ts`, `src/domain/shared/guardrails/regex-search-safety.ts` |
| D14 | 3.4 | 4.2 | WAITING | UNRESOLVED | TSDoc for mutation guardrails must be written after the final batch limits and refusal semantics are settled. | `src/domain/mutation/**/*.ts` |
| D15 | 2.1 | 4.3 | WAITING | UNRESOLVED | Final validation must include the inspection-family truncation, result-shaping, and response-cap behavior after those changes exist. | `src/domain/inspection/**/*.ts` |
| D16 | 3.1 | 4.3 | WAITING | UNRESOLVED | Final validation must include diff-family request/response budgets after the comparison endpoints are hardened. | `src/domain/comparison/**/*.ts` |
| D17 | 3.4 | 4.3 | WAITING | UNRESOLVED | Final validation must include mutation-family blast-radius and request-budget behavior after the mutation rollout completes. | `src/domain/mutation/**/*.ts` |

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
| ISOLATED | No dependencies | YES | YES |
| SEQUENTIAL | Ordered within unit | NO | After predecessor |
| DEPENDENT | Shared file conflict | CONDITIONAL | After conflict resolves |
| WAITING | Cross-unit blocker | NO | After unblocked |

### Dependency Types
| Type | Description | Resolution |
|------|-------------|------------|
| WAITING | Target MUST be DONE first | Auto when target DONE |
| SEQUENTIAL | Source MUST be DONE first | Auto when source DONE |
| SHARED_FILE | Same file modified | Sequential execution |

## Notes for Orchestrating Agent
- Execute Unit 1 first. No downstream unit should start before task `1.1` is complete because the shared limit matrix and error contract are the single source of truth for all later work.
- Favor isolated execution only where file surfaces do not overlap. When a later task depends on values or helper contracts from the shared foundation, treat that dependency as authoritative rather than re-deriving local constants.
- The plan intentionally separates schema caps, handler preflights, runtime result shaping, and the final server-shell fuse to avoid duplicate governance and cross-endpoint drift.
- The user explicitly requested a no-breaking-change rollout. Optional request-surface additions are allowed only when they do not invalidate existing callers and when the task file explicitly marks the addition as non-breaking.
