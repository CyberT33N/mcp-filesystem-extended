# Guardrails Overview

> **Context:** See [`CONVENTIONS.md`](../../CONVENTIONS.md) for the full conventions index and core invariants.

This document catalogs all guardrail layers in the MCP Filesystem Extended server, their placement in the execution stack, the concrete limits they enforce, and which endpoint families they govern.

---

## Guardrail Layers — Execution Order

The following table lists all guardrail layers from first to last execution position. Every request passes through the applicable layers for its family in this order.

| # | Layer | Location | Mechanism | Scope |
|---|---|---|---|---|
| 1 | **Request Schema Caps** | `src/domain/shared/guardrails/tool-guardrail-limits.ts` | Zod schema validation | All endpoints — before handler |
| 2 | **Proactive Admission Decision** | `src/domain/shared/guardrails/traversal-workload-admission.ts` | `resolveTraversalWorkloadAdmissionDecision()` | Resume-capable inspection endpoints only |
| 3 | **Candidate Workload Probe** | `src/domain/shared/guardrails/traversal-candidate-workload.ts` | `collectTraversalCandidateWorkloadEvidence()` | Resume-capable inspection endpoints only |
| 4 | **Preview-Lane Runtime Budget** | `src/domain/shared/guardrails/traversal-runtime-budget.ts` | `assertTraversalRuntimeBudget()` with bounded limits | Preview-family endpoints during `next-chunk` execution |
| 5 | **Family-Level Response Cap** | `src/domain/shared/guardrails/text-response-budget.ts` | `assertActualTextBudget()` | Inline and `next-chunk` modes only — **must not fire in `complete-result` mode** |
| 6 | **Global Response Fuse** | `src/application/server/filesystem-server.ts` | `assertActualTextBudget(... GLOBAL_RESPONSE_HARD_CAP_CHARS ...)` | ALL endpoints, ALL modes — non-bypassable |

---

## Layer 1: Request Schema Caps

**Source:** [`src/domain/shared/guardrails/tool-guardrail-limits.ts`](../../src/domain/shared/guardrails/tool-guardrail-limits.ts)

**Purpose:** Reject abusive or malformed request shapes before handler execution begins.

**Key limits:**

| Constant | Value | Applies to |
|---|---|---|
| `PATH_MAX_CHARS` | 4,096 | All path fields |
| `GLOB_PATTERN_MAX_CHARS` | 1,024 | All glob pattern fields |
| `REGEX_PATTERN_MAX_CHARS` | 2,048 | Regex pattern fields |
| `MAX_DISCOVERY_ROOTS_PER_REQUEST` | 128 | Discovery endpoint root arrays |
| `MAX_REGEX_ROOTS_PER_REQUEST` | 64 | Regex/fixed-string search root arrays |
| `MAX_GENERIC_PATHS_PER_REQUEST` | 512 | Generic path batch fields |
| `DISCOVERY_MAX_RESULTS_HARD_CAP` | 1,000 | Discovery result count fields |
| `MAX_TOTAL_RAW_TEXT_REQUEST_CHARS` | 400,000 | Aggregate raw content input |

These caps are **schema-layer controls only**. They reject requests before any filesystem access begins.

---

## Layer 2: Proactive Admission Decision

**Source:** [`src/domain/shared/guardrails/traversal-workload-admission.ts`](../../src/domain/shared/guardrails/traversal-workload-admission.ts)

**Purpose:** Route broad recursive traversal requests into the correct execution lane before any traversal begins.

**Applies to:** The six resume-capable inspection endpoints only: `list_directory_entries`, `find_files_by_glob`, `find_paths_by_name`, `search_file_contents_by_regex`, `search_file_contents_by_fixed_string`, `count_lines`.

**No other endpoint in the codebase uses this layer.**

**Admission outcomes:**

| Outcome | Meaning |
|---|---|
| `inline` | Safe to execute and return the full result in one synchronous response |
| `preview-first` | Too broad for inline; return a bounded preview chunk and a `resumeToken` |
| `completion-backed-required` | Too broad for inline or preview-first; must use completion-backed execution with a `resumeToken` |
| `narrowing-required` | Exceeds all available execution bands; the caller must reduce scope |

**This layer is routing logic, not a result-blocking guard.** In `complete-result` mode the handler continues past a `preview-first` admission into full traversal. The admission outcome is preserved in the persisted session for metadata purposes.

### Tier Budgets (execution-policy tier lookup)

The tier is resolved from the detected `IoCapabilityProfile`. Inline entry and time budgets by tier:

| Tier | Inline entries | Inline dirs | Inline execution ms | Preview entries | Preview dirs |
|---|---|---|---|---|---|
| S | 35,000 | 3,500 | 4,500 | 70,000 | 7,000 |
| A | 25,000 | 2,500 | 4,000 | 55,000 | 5,500 |
| B | 18,000 | 1,800 | 3,500 | 40,000 | 4,000 |
| C | 12,000 | 1,200 | 3,000 | 30,000 | 3,000 |
| D | 8,000 | 800 | 2,500 | 20,000 | 2,000 |

---

## Layer 3: Candidate Workload Probe

**Source:** [`src/domain/shared/guardrails/traversal-candidate-workload.ts`](../../src/domain/shared/guardrails/traversal-candidate-workload.ts)

**Purpose:** Sample the candidate traversal workload before execution begins to supply conservative cost estimates to the admission layer.

**Applies to:** Resume-capable inspection endpoints only. Not used by read, metadata, diff, or mutation endpoints.

---

## Layer 4: Preview-Lane Runtime Budget

**Source:** [`src/domain/shared/guardrails/traversal-runtime-budget.ts`](../../src/domain/shared/guardrails/traversal-runtime-budget.ts)

**Purpose:** Enforce deterministic per-chunk boundaries during preview-first traversal so a bounded preview chunk can be delivered safely.

**Active in:** `next-chunk` delivery mode (preview traversal loop).

**NOT active in:** `complete-result` delivery mode. In `complete-result`, the full traversal uses the deeper emergency runtime safeguard instead (see Layer 6 context).

**Deep emergency runtime safeguard (separate from preview-lane):**

| Constant | Value |
|---|---|
| `TRAVERSAL_RUNTIME_MAX_VISITED_ENTRIES` | 500,000 |
| `TRAVERSAL_RUNTIME_MAX_VISITED_DIRECTORIES` | 50,000 |
| `TRAVERSAL_RUNTIME_SOFT_TIME_BUDGET_MS` | 5,000ms |

This safeguard fires only for truly pathological traversals that bypassed all earlier admission bands. It is not the primary caller-facing control.

---

## Layer 5: Family-Level Response Cap

**Source:** [`src/domain/shared/guardrails/text-response-budget.ts`](../../src/domain/shared/guardrails/text-response-budget.ts) + [`src/domain/shared/guardrails/tool-guardrail-limits.ts`](../../src/domain/shared/guardrails/tool-guardrail-limits.ts)

**Purpose:** Enforce per-family text-output ceilings that are tighter than the global fuse, to prevent any single family from consuming an unreasonable share of the caller's context window in a single inline or chunk response.

**Family caps:**

| Constant | Value | Applies to |
|---|---|---|
| `DISCOVERY_RESPONSE_CAP_CHARS` | 150,000 | `list_directory_entries`, `find_files_by_glob`, `find_paths_by_name`, `count_lines` |
| `REGEX_SEARCH_RESPONSE_CAP_CHARS` | 120,000 | `search_file_contents_by_regex`, `search_file_contents_by_fixed_string` |
| `READ_FILES_RESPONSE_CAP_CHARS` | 450,000 | `read_files_with_line_numbers` |
| `READ_FILE_CONTENT_RESPONSE_CAP_CHARS` | 450,000 | `read_file_content` |
| `METADATA_RESPONSE_CAP_CHARS` | 100,000 | `get_path_metadata`, `get_file_checksums`, `verify_file_checksums` |
| `FILE_DIFF_RESPONSE_CAP_CHARS` | 300,000 | `diff_files` |
| `TEXT_DIFF_RESPONSE_CAP_CHARS` | 240,000 | `diff_text_content` |
| `PATH_MUTATION_SUMMARY_CAP_CHARS` | 60,000 | All mutation endpoints |

### ⚠️ Mode-Aware Rule for Resume-Capable Endpoints

For the six resume-capable inspection endpoints, the family-level cap **must not apply in `complete-result` mode**. In that mode, the caller has explicitly contracted for a complete result via the resume-session protocol. The global fuse (Layer 6) is the correct and only ceiling for `complete-result` responses.

Applying the family cap in `complete-result` mode is an **architectural legacy conflict** that blocks valid server-owned completion attempts. The correct implementation:

```typescript
// Correct mode-aware cap selection for resume-capable handlers:
const isCompleteResultMode = requestedResumeMode === INSPECTION_RESUME_MODES.COMPLETE_RESULT;
const effectiveResponseCap = isCompleteResultMode
  ? GLOBAL_RESPONSE_HARD_CAP_CHARS   // 600,000 — the non-bypassable floor for this mode
  : FAMILY_RESPONSE_CAP_CHARS;       // e.g. 150,000 — appropriate for inline and next-chunk

assertActualTextBudget(toolName, output.length, effectiveResponseCap, summary);
```

For non-resume endpoints (`read_files_with_line_numbers`, `diff_files`, mutation endpoints, etc.), the family cap applies unconditionally because those endpoints have no delivery-mode concept.

---

## Layer 6: Global Response Fuse

**Source:** [`src/application/server/filesystem-server.ts`](../../src/application/server/filesystem-server.ts)

**Purpose:** Non-bypassable final safety ceiling applied by the server shell to every successful tool response regardless of endpoint, family, or delivery mode.

**Limit:** `GLOBAL_RESPONSE_HARD_CAP_CHARS = 600,000`

**This layer is always active.** No endpoint, no delivery mode, no resume state, and no explicit user contract can bypass it. It is the only ceiling that applies to `complete-result` responses for resume-capable endpoints.

---

## Which Layers Apply to Which Endpoint Families

| Family | Schema (1) | Admission (2) | Probe (3) | Preview Budget (4) | Family Cap (5) | Global Fuse (6) |
|---|---|---|---|---|---|---|
| `list_directory_entries` | ✅ | ✅ | ✅ | ✅ next-chunk only | ✅ inline + next-chunk only | ✅ always |
| `find_files_by_glob` | ✅ | ✅ | ✅ | ✅ next-chunk only | ✅ inline + next-chunk only | ✅ always |
| `find_paths_by_name` | ✅ | ✅ | ✅ | ✅ next-chunk only | ✅ inline + next-chunk only | ✅ always |
| `search_file_contents_by_regex` | ✅ | ✅ | ✅ | ✅ next-chunk only | ✅ inline + next-chunk only | ✅ always |
| `search_file_contents_by_fixed_string` | ✅ | ✅ | ✅ | ✅ next-chunk only | ✅ inline + next-chunk only | ✅ always |
| `count_lines` | ✅ | ✅ | ✅ | ❌ no preview mode | ✅ inline + complete-result final output | ✅ always |
| `read_files_with_line_numbers` | ✅ | ❌ | ❌ | ❌ | ✅ unconditional | ✅ always |
| `read_file_content` | ✅ | ❌ | ❌ | ❌ | ✅ unconditional | ✅ always |
| All metadata endpoints | ✅ | ❌ | ❌ | ❌ | ✅ unconditional | ✅ always |
| All diff endpoints | ✅ | ❌ | ❌ | ❌ | ✅ unconditional | ✅ always |
| All mutation endpoints | ✅ | ❌ | ❌ | ❌ | ✅ unconditional | ✅ always |
