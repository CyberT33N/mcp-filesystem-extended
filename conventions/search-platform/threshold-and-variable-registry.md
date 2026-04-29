# Search Platform Threshold and Variable Registry

> **Context:** See [`overview.md`](./overview.md) and [`preflight-and-hardgap-governance.md`](./preflight-and-hardgap-governance.md).

---

## Purpose

This document records the canonical variables and thresholds that govern the search platform and its adjacent large-text lane architecture.

It is a documentation SSOT for variable purpose and ownership.

---

## Shared Search Execution Policy Variables

Source: [`src/domain/shared/search/search-execution-policy.ts`](../../src/domain/shared/search/search-execution-policy.ts)

| Variable / field | Current role | Architectural ownership |
|---|---|---|
| `syncComfortWindowSeconds` | sync execution comfort window | shared search policy |
| `taskRecommendedAfterSeconds` | completion-backed escalation time threshold | shared search policy |
| `previewFirstResponseCapFraction` | preview-family response-band trigger | shared search policy |
| `taskBackedResponseCapFraction` | completion-backed response-band trigger | shared search policy |
| `regexSyncCandidateBytesCap` | regex sync candidate-byte cap | shared search policy |
| `fixedStringSyncCandidateBytesCap` | fixed-string sync candidate-byte cap | shared search policy |
| `regexServiceHardGapBytes` | regex over-hard-gap surface | shared search policy; must not be treated as a blanket explicit-file blocker |
| `fixedStringServiceHardGapBytes` | fixed-string over-hard-gap surface | shared search policy; must not be treated as a blanket explicit-file blocker |
| `traversalInlineEntryBudget` | inline recursive admission budget | shared search policy |
| `traversalInlineDirectoryBudget` | inline recursive admission budget | shared search policy |
| `traversalInlineCandidateFileBudget` | inline recursive admission budget | shared search policy |
| `traversalInlineExecutionBudgetMs` | inline recursive admission budget | shared search policy |
| `traversalPreviewFirstEntryBudget` | preview-family recursive admission budget | shared search policy |
| `traversalPreviewFirstDirectoryBudget` | preview-family recursive admission budget | shared search policy |
| `traversalPreviewExecutionEntryBudget` | preview-lane runtime budget | shared search policy |
| `traversalPreviewExecutionDirectoryBudget` | preview-lane runtime budget | shared search policy |
| `traversalPreviewExecutionTimeBudgetMs` | preview-lane runtime budget | shared search policy |

---

## Shared Guardrail Variables

Source: [`src/domain/shared/guardrails/tool-guardrail-limits.ts`](../../src/domain/shared/guardrails/tool-guardrail-limits.ts)

| Variable | Current role | Notes |
|---|---|---|
| `REGEX_SEARCH_MAX_CANDIDATE_BYTES` | search-family candidate-byte hardgap constant | future-state usage must distinguish recursive aggregate governance from explicit-file search entry |
| `REGEX_SEARCH_MAX_RESULTS_HARD_CAP` | search result hard cap | remains valid |
| `REGEX_SEARCH_EXCERPT_MAX_CHARS` | excerpt shaping limit | remains valid |
| `REGEX_SEARCH_RESPONSE_CAP_CHARS` | search-family response cap | remains valid |
| `DISCOVERY_RESPONSE_CAP_CHARS` | discovery-family response cap | remains valid |
| `GLOBAL_RESPONSE_HARD_CAP_CHARS` | final application-shell fuse | remains valid and unchanged |
| `TRAVERSAL_PREFLIGHT_MAX_VISITED_ENTRIES` | recursive preflight breadth ceiling | remains valid |
| `TRAVERSAL_PREFLIGHT_MAX_VISITED_DIRECTORIES` | recursive preflight breadth ceiling | remains valid |
| `TRAVERSAL_PREFLIGHT_SOFT_TIME_BUDGET_MS` | recursive preflight time ceiling | remains valid |
| `TRAVERSAL_RUNTIME_MAX_VISITED_ENTRIES` | deeper traversal safeguard | remains valid |
| `TRAVERSAL_RUNTIME_MAX_VISITED_DIRECTORIES` | deeper traversal safeguard | remains valid |
| `TRAVERSAL_RUNTIME_SOFT_TIME_BUDGET_MS` | deeper traversal safeguard | remains valid |

---

## Resume and Structured Authority Variables

Source: [`src/domain/shared/resume/inspection-resume-contract.ts`](../../src/domain/shared/resume/inspection-resume-contract.ts)

| Variable / field | Role |
|---|---|
| `resumeToken` | server-owned same-endpoint resume-session handle |
| `resumeMode` | caller-selected resume intent |
| `supportedResumeModes` | authoritative per-family resume-mode set |
| `recommendedResumeMode` | server recommendation for the active session |
| `admission` | lane metadata |
| `resume` | authoritative resumability/session metadata |

---

## Ownership Rules

1. Response caps remain response-shaping controls.
2. Recursive traversal budgets remain recursive admission and preview-lane controls.
3. Content-state classification remains the text-eligibility authority.
4. Explicit-file search eligibility must not be defined solely by the generic candidate-byte hardgap constant.
5. Global cap ownership remains in the shared guardrail registry and the application shell.
