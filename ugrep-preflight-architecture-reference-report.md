# Reference Document: Ugrep Search, Preflight, Hardgap, Resume Lanes, and Convention Coverage
[INTENT: CONTEXT]

---

## 1. Task Overview
[INTENT: CONTEXT]

This reference document defines the complete implementation context for correcting the current large-file search architecture around `ugrep`, candidate-byte preflight refusal, recursive admission lanes, resume semantics, and convention coverage.

It is designed so that an autonomous LLM agent can complete the task without having to rediscover the architecture from the repository.

The report covers all of the following:

- the **current invalid state**,
- the **current partially correct state**,
- the **target architecture**,
- the **complete affected endpoint set**,
- the **exact files that must be changed**,
- the **exact files that must remain unchanged**,
- the **new convention files that must be created**,
- and the **root convention TOC updates** required to expose the future-state architecture.

The core architecture decision documented here is:

> The current hard candidate-byte preflight refusal on explicit large text-file search for the preview-capable regex and fixed-string families is not aligned with the accepted target architecture.

The accepted target architecture is:

- `ugrep` is the primary search backend for large text-search workloads,
- recursive workloads are governed by **server-side admission lanes**,
- preview-capable families use **same-endpoint resume** with `next-chunk` and `complete-result`,
- [`count_lines`](src/application/server/register-inspection-tool-catalog.ts:472) remains **completion-backed only**,
- read families remain **separate bounded read contracts**,
- and explicit large text-compatible file search must not be rejected solely because the file is large before the `ugrep` lane is allowed to execute.

---

## 2. Information Register (Content Units)
[INTENT: REFERENCE]

| ID | Type | Description | Change | Status |
|----|------|-------------|--------|--------|
| REQ-001 | REQUIREMENT | Remove or correctly scope the invalid explicit-file candidate-byte preflight refusal on preview-capable search families. | Yes | ✅ |
| REQ-002 | REQUIREMENT | Preserve server-side preflight, but restrict it to the architecturally correct roles and lanes. | Yes | ✅ |
| REQ-003 | REQUIREMENT | Document the complete affected endpoint set and distinguish direct-fix families from adjacent reference-only families. | Yes | ✅ |
| REQ-004 | REQUIREMENT | Provide the exact file-by-file implementation target map, including code, contract, and description surfaces. | Yes | ✅ |
| REQ-005 | REQUIREMENT | Provide full future-state convention drafts for the missing `ugrep` / preflight / hardgap architecture coverage. | Yes | ✅ |
| INFO-001 | INFORMATION | Authoritative source stack and precedence model for deciding the target architecture. | No | ✅ |
| INFO-002 | INFORMATION | Current invalid and stale runtime state that must not be mirrored into future conventions. | No | ✅ |
| INFO-003 | INFORMATION | Current accepted target-state runtime layers that are already correct and must be preserved. | No | ✅ |
| CONV-001 | CONVENTION | Server-owned guardrail hierarchy, lane ownership, and hard-cap ownership remain non-negotiable. | No | ✅ |
| CONV-002 | CONVENTION | Search, read, and count remain separate concerns with different backend responsibilities. | No | ✅ |
| WF-001 | WORKFLOW | Recommended execution order for an autonomous agent implementing the corrective refactor and the missing conventions. | Yes | ✅ |
| CONST-001 | CONSTRAINT | No cap inflation, no fuse weakening, no compatibility shims, and no query resend as part of the fix. | No | ✅ |

---

## 3. Information Units
[INTENT: SPECIFICATION]

### 3.1 REQ-001: Remove or correctly scope the invalid explicit-file candidate-byte preflight refusal
[INTENT: SPECIFICATION]

**Type:** REQUIREMENT

**Description:**
The current explicit-file search path for the preview-capable regex and fixed-string families rejects large text-compatible files before the `ugrep` search lane is allowed to execute. This behavior is no longer architecturally valid.

**Current State:**
- [`assertCandidateByteBudget()`](src/domain/shared/guardrails/filesystem-preflight.ts:452) is used as a hard pre-scan refusal surface.
- The fixed-string explicit-file path applies that refusal inside [`collectFixedStringMatchesFromFileEntry()`](src/domain/inspection/search-file-contents-by-fixed-string/fixed-string-search-file-entry.ts:101).
- The regex explicit-file path applies that refusal inside [`collectRegexMatchesFromFileEntry()`](src/domain/inspection/search-file-contents-by-regex/search-regex-path-result.ts:290).
- The governing hard value is [`REGEX_SEARCH_MAX_CANDIDATE_BYTES`](src/domain/shared/guardrails/tool-guardrail-limits.ts:491), currently `33,554,432` bytes.
- [`resolveSearchExecutionPolicy()`](src/domain/shared/search/search-execution-policy.ts:296) currently maps both `regexServiceHardGapBytes` and `fixedStringServiceHardGapBytes` to the same `REGEX_SEARCH_MAX_CANDIDATE_BYTES`, even though `fixedStringSyncCandidateBytesCap` is already more generous than the regex sync cap.
- This creates the concrete failure observed by the user:
  - a single explicit large SQL dump file,
  - a small bounded literal search request,
  - and a hard `metadata_preflight_rejected` refusal before `ugrep` can do the actual scan.

**Target State:**
- For **explicit file scopes** on preview-capable search families, large **text-compatible** files must not be rejected solely because the file byte size exceeds the current recursive candidate-byte hardgap.
- The explicit-file search lane must be allowed to proceed when the content state is text-compatible enough for the requested operation.
- Result safety must remain bounded by:
  - content-state eligibility,
  - pattern/runtime safety,
  - `maxResults`,
  - family response caps,
  - resume lane logic when needed,
  - and the global response fuse.
- The recursive candidate aggregate hardgap may remain a valid concept for broad traversal workloads, but it must not continue to act as a blanket explicit-file search blocker.

**File References:**

| File Path | Relevance | Relevant Elements |
|-----------|-----------|-------------------|
| [`src/domain/inspection/search-file-contents-by-fixed-string/fixed-string-search-file-entry.ts`](src/domain/inspection/search-file-contents-by-fixed-string/fixed-string-search-file-entry.ts) | Current fixed-string explicit-file blocker | [`collectFixedStringMatchesFromFileEntry()`](src/domain/inspection/search-file-contents-by-fixed-string/fixed-string-search-file-entry.ts:101), [`assertCandidateByteBudget()`](src/domain/inspection/search-file-contents-by-fixed-string/fixed-string-search-file-entry.ts:133) |
| [`src/domain/inspection/search-file-contents-by-regex/search-regex-path-result.ts`](src/domain/inspection/search-file-contents-by-regex/search-regex-path-result.ts) | Current regex explicit-file blocker | [`collectRegexMatchesFromFileEntry()`](src/domain/inspection/search-file-contents-by-regex/search-regex-path-result.ts:290), [`assertCandidateByteBudget()`](src/domain/inspection/search-file-contents-by-regex/search-regex-path-result.ts:328) |
| [`src/domain/shared/guardrails/filesystem-preflight.ts`](src/domain/shared/guardrails/filesystem-preflight.ts) | Shared preflight refusal builder | [`assertCandidateByteBudget()`](src/domain/shared/guardrails/filesystem-preflight.ts:452) |
| [`src/domain/shared/guardrails/tool-guardrail-limits.ts`](src/domain/shared/guardrails/tool-guardrail-limits.ts) | Shared hardgap constant | [`REGEX_SEARCH_MAX_CANDIDATE_BYTES`](src/domain/shared/guardrails/tool-guardrail-limits.ts:491) |
| [`src/domain/shared/search/search-execution-policy.ts`](src/domain/shared/search/search-execution-policy.ts) | Shared search policy vocabulary | [`resolveSearchExecutionPolicy()`](src/domain/shared/search/search-execution-policy.ts:296) |

**✅ Positive Example(s):**

```text
Input:
  endpoint = search_file_contents_by_fixed_string
  roots = ["apps/data/big-dump.sql"]
  fixedString = "CREATE TABLE [dbo].[ZPLAN]"
  maxResults = 20

Correct behavior:
  1. validate path and file type
  2. classify content state
  3. if state is TEXT_CONFIDENT or HYBRID_TEXT_DOMINANT, allow the explicit-file search lane
  4. execute the shared `ugrep` backend
  5. bound the caller-visible response with result limits and response caps
```

**❌ Negative Example(s):**

```text
Wrong behavior:
  1. explicit file scope is validated
  2. file size = 1,873,975,117 bytes
  3. compare directly against 33,554,432-byte candidate ceiling
  4. refuse before the shared `ugrep` backend is allowed to scan

Why wrong:
  This treats a large explicit text-compatible file as if broad recursive aggregate candidate
  pressure and explicit single-file search were the same architectural surface.
```

---

### 3.2 REQ-002: Preserve preflight, but restrict it to the architecturally correct roles and lanes
[INTENT: SPECIFICATION]

**Type:** REQUIREMENT

**Description:**
The correct fix is not “remove preflight.” The correct fix is “keep preflight, but give each preflight layer the correct architectural responsibility.”

**Current State:**
- The project already contains a valid layered guardrail model in [`conventions/guardrails/overview.md`](conventions/guardrails/overview.md).
- The project already contains a valid preview/resume model in [`conventions/resume-architecture/overview.md`](conventions/resume-architecture/overview.md) and [`conventions/resume-architecture/workflow.md`](conventions/resume-architecture/workflow.md).
- The current defect comes from the wrong preflight role being applied to the wrong surface.

**Target State:**
- **Schema caps** remain valid.
- **Content-state classification** remains valid.
- **Recursive traversal admission** remains valid.
- **Preview-lane runtime budgets** remain valid.
- **Mode-aware response caps** remain valid.
- **Global fuse** remains valid.
- The invalid part is only the current use of the recursive candidate-byte hardgap as a hard pre-scan refusal for explicit large text-compatible file search.

**Required Lane Model:**

| Surface | Correct Owner | Correct Decision |
|---------|---------------|------------------|
| Base request shape | Schema caps | accept or reject malformed / abusive request shape |
| File content eligibility | Shared content-state classifier | allow or refuse based on text compatibility |
| Broad recursive workload | Shared traversal admission planner | `inline`, `preview-first`, `completion-backed-required`, `narrowing-required` |
| Explicit file search | Shared search lane | execute backend if content state is supported |
| Preview / completion result size | Family caps + global fuse | bound caller-visible payload |

**File References:**

| File Path | Relevance | Relevant Elements |
|-----------|-----------|-------------------|
| [`conventions/guardrails/overview.md`](conventions/guardrails/overview.md) | Current correct layer overview | guardrail layers 1–6 |
| [`conventions/resume-architecture/overview.md`](conventions/resume-architecture/overview.md) | Current correct lane architecture | preview-capable families, completion-backed family |
| [`src/domain/shared/guardrails/traversal-workload-admission.ts`](src/domain/shared/guardrails/traversal-workload-admission.ts) | Shared admission planner | [`resolveTraversalWorkloadAdmissionDecision()`](src/domain/shared/guardrails/traversal-workload-admission.ts:302) |
| [`src/domain/shared/guardrails/traversal-preview-lane.ts`](src/domain/shared/guardrails/traversal-preview-lane.ts) | Shared preview-lane planning | [`resolveTraversalPreviewLanePlan()`](src/domain/shared/guardrails/traversal-preview-lane.ts:40) |
| [`src/domain/shared/guardrails/text-response-budget.ts`](src/domain/shared/guardrails/text-response-budget.ts) | Projected and actual text budgeting | [`assertProjectedTextBudget()`](src/domain/shared/guardrails/text-response-budget.ts:111), [`assertActualTextBudget()`](src/domain/shared/guardrails/text-response-budget.ts:141) |

**✅ Positive Example(s):**

```text
Correct recursive discovery path:
  root directory -> preflight admission -> preview-first -> resume with next-chunk or complete-result

Correct explicit file search path:
  explicit file -> content-state classification -> shared search backend -> bounded result
```

**❌ Negative Example(s):**

```text
Wrong model:
  “Every large file must be blocked by preflight before search starts.”

Why wrong:
  That is valid for some materialized read surfaces, not for all search surfaces.
  It collapses lane-specific governance into one overly broad hard stop.
```

---

### 3.3 REQ-003: Document the complete affected endpoint set and distinguish direct-fix families from adjacent reference-only families
[INTENT: SPECIFICATION]

**Type:** REQUIREMENT

**Description:**
The report must give an autonomous agent the complete endpoint inventory so it knows exactly what must be changed, what is only adjacent architecture, and what must stay unchanged.

**Current State:**
The currently relevant endpoint families are spread across the runtime code, conventions, and plan artifacts. Without an explicit matrix, an autonomous agent can easily over-change or under-change the search platform.

**Target State:**
The agent must work from the following precise endpoint inventory.

**Affected Endpoint Inventory:**

| Endpoint | Public Registration | Role | Direct Fix? | Reason |
|----------|---------------------|------|-------------|--------|
| [`search_file_contents_by_fixed_string`](src/application/server/register-inspection-tool-catalog.ts:400) | preview-capable search family | literal content search | **Yes** | current explicit-file candidate-byte hard refusal can block valid large text search |
| [`search_file_contents_by_regex`](src/application/server/register-inspection-tool-catalog.ts:328) | preview-capable search family | regex content search | **Yes** | same class of explicit-file candidate-byte hard refusal exists on its explicit-file lane |
| [`list_directory_entries`](src/application/server/register-inspection-tool-catalog.ts:157) | preview-capable discovery family | directory listing | Reference only | same admission/resume contract must remain aligned |
| [`find_files_by_glob`](src/application/server/register-inspection-tool-catalog.ts:271) | preview-capable discovery family | glob path discovery | Reference only | same admission/resume contract must remain aligned |
| [`find_paths_by_name`](src/application/server/register-inspection-tool-catalog.ts:214) | preview-capable discovery family | name-based path discovery | Reference only | same admission/resume contract must remain aligned |
| [`count_lines`](src/application/server/register-inspection-tool-catalog.ts:472) | completion-backed family | total-only or pattern-aware counting | Reference only | same search/runtime vocabulary, but not the same explicit-file preflight defect |
| [`read_file_content`](src/application/server/register-inspection-tool-catalog.ts:131) | bounded read family | materialized single-file content access | No | file-size/bounded-read preflight is still correct here |
| [`read_files_with_line_numbers`](src/application/server/register-inspection-tool-catalog.ts:116) | bounded read family | materialized multi-file content access | No | projected/actual response budgeting remains correct here |

**File References:**

| File Path | Relevance | Relevant Elements |
|-----------|-----------|-------------------|
| [`src/application/server/register-inspection-tool-catalog.ts`](src/application/server/register-inspection-tool-catalog.ts) | Public tool inventory | all inspection registrations |
| [`conventions/resume-architecture/overview.md`](conventions/resume-architecture/overview.md) | Resume-capable family set | preview-capable vs completion-backed-only families |
| [`conventions/content-classification/operation-capability-matrix.md`](conventions/content-classification/operation-capability-matrix.md) | Content-inspecting family set | read/search/count capability matrix |

**✅ Positive Example(s):**

```text
Correct direct-fix scope:
  - search_file_contents_by_fixed_string
  - search_file_contents_by_regex

Correct aligned-reference scope:
  - list_directory_entries
  - find_files_by_glob
  - find_paths_by_name
  - count_lines
```

**❌ Negative Example(s):**

```text
Wrong scope statement:
  “Only the fixed-string endpoint is affected.”

Why wrong:
  The regex family has the same explicit-file blocker pattern, and the shared runtime contract
  means adjacent preview/resume families must be kept aligned even if they are not direct code-fix
  surfaces for this specific defect.
```

---

### 3.4 REQ-004: Provide the exact file-by-file implementation target map
[INTENT: SPECIFICATION]

**Type:** REQUIREMENT

**Description:**
An autonomous agent must receive a precise file-by-file map that distinguishes:

- mandatory code changes,
- mandatory convention additions,
- mandatory root-TOC updates,
- runtime-contract surfaces that must stay unchanged,
- and stale surfaces that must not be treated as future-state authority.

**Current State:**
The relevant architecture is distributed across code, conventions, historical plans, active runtime-refactor plans, and server-level descriptions.

**Target State:**
The agent must implement the corrective work through the exact target map in **Section 7** of this report and the convention drafts in **Section 8**.

**Primary Mandatory Code-Change Surfaces:**

| File | Why it must change |
|------|--------------------|
| [`src/domain/inspection/search-file-contents-by-fixed-string/fixed-string-search-file-entry.ts`](src/domain/inspection/search-file-contents-by-fixed-string/fixed-string-search-file-entry.ts) | remove or scope the invalid explicit-file candidate-byte hard refusal |
| [`src/domain/inspection/search-file-contents-by-regex/search-regex-path-result.ts`](src/domain/inspection/search-file-contents-by-regex/search-regex-path-result.ts) | remove or scope the invalid explicit-file candidate-byte hard refusal |
| [`src/domain/shared/search/search-execution-policy.ts`](src/domain/shared/search/search-execution-policy.ts) | clarify surface-specific hardgap ownership and keep family policy vocabulary coherent |
| [`src/domain/shared/guardrails/tool-guardrail-limits.ts`](src/domain/shared/guardrails/tool-guardrail-limits.ts) | keep the shared registry authoritative; update only if surface ownership must be re-described or split |
| [`src/application/server/register-inspection-tool-catalog.ts`](src/application/server/register-inspection-tool-catalog.ts) | align public runtime wording for search-family large-file behavior |
| [`src/application/server/server-instructions.ts`](src/application/server/server-instructions.ts) | align server-level runtime wording for the same target architecture |

**Secondary Mandatory Convention Surfaces:**

| File | Why it must change |
|------|--------------------|
| [`CONVENTIONS.md`](CONVENTIONS.md) | root TOC must expose the new search-platform convention set |
| `conventions/search-platform/overview.md` | missing target-state architecture overview |
| `conventions/search-platform/endpoint-family-lane-matrix.md` | missing endpoint-by-endpoint lane contract |
| `conventions/search-platform/preflight-and-hardgap-governance.md` | missing preflight/hardgap role definition |
| `conventions/search-platform/threshold-and-variable-registry.md` | missing variable and threshold registry |

**Stale / Invalid Surfaces That Must Not Drive the Future-State Conventions:**

| File | Why it is stale |
|------|------------------|
| [`src/domain/shared/continuation/inspection-continuation-contract.ts`](src/domain/shared/continuation/inspection-continuation-contract.ts) | old continuation vocabulary superseded by resume-session target state |
| [`src/infrastructure/persistence/inspection-continuation-sqlite-store.ts`](src/infrastructure/persistence/inspection-continuation-sqlite-store.ts) | old continuation-store vocabulary superseded by resume-session target state |
| [`__bak__/plan-ugrep/PLAN.md`](__bak__/plan-ugrep/PLAN.md) and child tasks | historical implementation lineage only, not future-state authority |

**✅ Positive Example(s):**

```text
Correct file-level instruction:
  “Change explicit-file search entry logic in fixed-string and regex families,
   add a dedicated conventions/search-platform/ block,
   keep read-family bounded-read preflight intact.”
```

**❌ Negative Example(s):**

```text
Wrong file-level instruction:
  “Raise the global caps in shared limits and the issue is solved.”

Why wrong:
  The issue is lane ownership, not cap inflation. Raising caps preserves the invalid control plane
  and weakens the safety model instead of correcting the architecture.
```

---

### 3.5 REQ-005: Provide full future-state convention drafts for `ugrep`, preflight, hardgap, variables, and lane architecture
[INTENT: SPECIFICATION]

**Type:** REQUIREMENT

**Description:**
The conventions area currently lacks a complete future-state documentation set for the search platform, `ugrep`, explicit-file search behavior, preflight lane semantics, and threshold ownership. This must be corrected with complete convention drafts embedded directly in this report.

**Current State:**
- The root TOC [`CONVENTIONS.md`](CONVENTIONS.md) does not expose any dedicated `ugrep` / search-platform / explicit-file preflight documents.
- The current conventions tree does cover guardrails, resume architecture, content classification, and structured-content authority.
- It does **not** yet provide one future-state convention area that tells a new agent how `ugrep`, search lanes, explicit-file search, recursive admission, hardgaps, and threshold ownership fit together.

**Target State:**
- Create a new convention folder `conventions/search-platform/`.
- Add the four complete convention files provided in **Section 8**.
- Update the root TOC in [`CONVENTIONS.md`](CONVENTIONS.md) to link them.
- Keep the new conventions future-state only: they document the architecture that should remain after refactoring, not the legacy or deleted behavior.

**File References:**

| File Path | Relevance | Relevant Elements |
|-----------|-----------|-------------------|
| [`CONVENTIONS.md`](CONVENTIONS.md) | root convention TOC | search-platform entry insertion |
| [`conventions/guardrails/overview.md`](conventions/guardrails/overview.md) | adjacent guardrail conventions | preserve as related reference, not replacement |
| [`conventions/resume-architecture/overview.md`](conventions/resume-architecture/overview.md) | adjacent resume conventions | preserve as related reference, not replacement |
| [`conventions/content-classification/overview.md`](conventions/content-classification/overview.md) | adjacent content-state conventions | preserve as related reference, not replacement |

**✅ Positive Example(s):**

```text
Correct convention outcome:
  - one dedicated search-platform overview
  - one endpoint-family lane matrix
  - one preflight/hardgap governance document
  - one threshold and variable registry
  - root TOC updated to expose all four documents
```

**❌ Negative Example(s):**

```text
Wrong convention outcome:
  - only add one vague ugrep note to CONVENTIONS.md
  - keep all lane/hardgap rules spread across plans only

Why wrong:
  The user explicitly requires complete future-state convention coverage, not scattered historical
  plan fragments.
```

---

### 3.6 INFO-001: Authoritative source stack and precedence model
[INTENT: SPECIFICATION]

**Type:** INFORMATION

**Description:**
The target architecture for this task must be derived from the following precedence stack.

**Authoritative Order:**
1. Current accepted architecture content in the runtime-refactor plan chain, especially:
   - [`1.5-traversal-preflight-and-runtime-budget-refactor.md`](.plan/1-runtime-architecture-refactors/1.5-traversal-preflight-and-runtime-budget-refactor.md)
   - [`1.6-traversal-workload-admission-and-lane-routing-completion.md`](.plan/1-runtime-architecture-refactors/1.6-traversal-workload-admission-and-lane-routing-completion.md)
   - [`1.7-traversal-admission-threshold-recalibration-and-tsdoc-hardening.md`](.plan/1-runtime-architecture-refactors/1.7-traversal-admission-threshold-recalibration-and-tsdoc-hardening.md)
   - [`1.8-continuation-token-and-sqlite-resume-architecture.md`](.plan/1-runtime-architecture-refactors/1.8-continuation-token-and-sqlite-resume-architecture.md)
   - [`1.9-preview-continuation-delivery-and-response-budget-hardening.md`](.plan/1-runtime-architecture-refactors/1.9-preview-continuation-delivery-and-response-budget-hardening.md)
   - [`1.10-continuation-response-contract-and-consumer-alignment.md`](.plan/1-runtime-architecture-refactors/1.10-continuation-response-contract-and-consumer-alignment.md)
   - [`1.12-resume-session-dual-delivery-and-endpoint-guidance-architecture.md`](.plan/1-runtime-architecture-refactors/1.12-resume-session-dual-delivery-and-endpoint-guidance-architecture.md)
2. Current conventions that are already correct and still binding:
   - [`conventions/guardrails/overview.md`](conventions/guardrails/overview.md)
   - [`conventions/guardrails/mcp-client-governance.md`](conventions/guardrails/mcp-client-governance.md)
   - [`conventions/resume-architecture/overview.md`](conventions/resume-architecture/overview.md)
   - [`conventions/resume-architecture/workflow.md`](conventions/resume-architecture/workflow.md)
   - [`conventions/resume-architecture/guardrail-interaction.md`](conventions/resume-architecture/guardrail-interaction.md)
   - [`conventions/content-classification/overview.md`](conventions/content-classification/overview.md)
   - [`conventions/content-classification/operation-capability-matrix.md`](conventions/content-classification/operation-capability-matrix.md)
   - [`conventions/mcp-response-contract/structured-content-contract.md`](conventions/mcp-response-contract/structured-content-contract.md)
3. Current code surfaces as implementation-reality check.
4. Historical `__bak__` plan surfaces as lineage only.

**Important Rule:**
Historical `__bak__` plan artifacts may explain why `ugrep` was introduced, but they must not override the later accepted runtime-refactor architecture.

---

### 3.7 INFO-002: Current invalid and stale runtime state that must not be mirrored into future conventions
[INTENT: SPECIFICATION]

**Type:** INFORMATION

**Description:**
The future-state convention set must not copy the following invalid or stale surfaces as if they were still the target architecture.

**Invalid / stale items:**

1. **Explicit-file candidate-byte hard refusal on preview-capable search families**
   - invalid target-state behavior
   - current defect trigger

2. **Old continuation vocabulary surfaces**
   - [`src/domain/shared/continuation/inspection-continuation-contract.ts`](src/domain/shared/continuation/inspection-continuation-contract.ts)
   - [`src/infrastructure/persistence/inspection-continuation-sqlite-store.ts`](src/infrastructure/persistence/inspection-continuation-sqlite-store.ts)
   - stale relative to the accepted resume-session target architecture centered on [`src/domain/shared/resume/inspection-resume-contract.ts`](src/domain/shared/resume/inspection-resume-contract.ts:16) and [`src/infrastructure/persistence/inspection-resume-session-sqlite-store.ts`](src/infrastructure/persistence/inspection-resume-session-sqlite-store.ts:91)

3. **Historical `__bak__` architecture as final-state authority**
   - invalid for future-state conventions
   - valid only as implementation lineage

4. **Outdated plan-state counters as architecture truth**
   - [`PLAN.md`](PLAN.md)
   - [`.plan/1-runtime-architecture-refactors/orchestration.md`](.plan/1-runtime-architecture-refactors/orchestration.md)
   - these files contain status/frontier information that is not cleanly aligned with all runtime plan content and must not override the architectural decisions already described in the task documents themselves.

---

### 3.8 INFO-003: Current target-state runtime layers that are already correct and must be preserved
[INTENT: SPECIFICATION]

**Type:** INFORMATION

**Description:**
The following architecture surfaces are already correct and must remain intact while fixing the explicit-file search preflight defect.

**Preserve exactly:**

- preview-capable same-endpoint resume with `next-chunk` and `complete-result`, see [`inspection-resume-contract.ts`](src/domain/shared/resume/inspection-resume-contract.ts:16)
- completion-backed-only semantics for [`count_lines`](src/application/server/register-inspection-tool-catalog.ts:472)
- mode-aware response-cap behavior on preview families, see [`assertFormattedRegexResponseBudget()`](src/domain/inspection/search-file-contents-by-regex/search-regex-result.ts:253) and [`assertFormattedFixedStringResponseBudget()`](src/domain/inspection/search-file-contents-by-fixed-string/search-fixed-string-result.ts:241)
- structuredContent authority for continuation/resume metadata, see [`server-instructions.ts`](src/application/server/server-instructions.ts:11)
- shared content-state classification and capability gating, see [`classifyInspectionContentState()`](src/domain/shared/search/inspection-content-state.ts:639) and [`resolveInspectionContentOperationCapability()`](src/domain/shared/search/inspection-content-state.ts:808)
- separation of read backend vs search backend, see [`text-read-core.ts`](src/infrastructure/filesystem/text-read-core.ts:147) and [`ugrep-command-builder.ts`](src/infrastructure/search/ugrep-command-builder.ts:95)

---

### 3.9 CONV-001: Non-negotiable target-state guardrail hierarchy
[INTENT: CONSTRAINT]

**Type:** CONVENTION

**Description:**
The target-state guardrail hierarchy must remain server-owned and layered.

**Hierarchy:**
1. schema request caps
2. content-state eligibility
3. recursive traversal admission
4. preview-lane runtime budget
5. family response caps
6. global response fuse

**Rule:**
No corrective work may solve the issue by deleting layers 5 or 6, by moving primary scope estimation back into prompting, or by using cap inflation instead of lane-correct routing.

---

### 3.10 CONV-002: Search, read, and count remain separate backend concerns
[INTENT: CONSTRAINT]

**Type:** CONVENTION

**Description:**
The future-state conventions must preserve the backend responsibility split:

| Concern | Backend |
|---------|---------|
| search | `ugrep` |
| read | shared text-read core + streaming reader |
| count total-only | streaming line counter |
| count pattern-aware | shared native-search lane |

The future-state conventions must not blur these concerns into a single generic large-file engine.

---

### 3.11 WF-001: Recommended autonomous implementation order
[INTENT: SPECIFICATION]

**Type:** WORKFLOW

**Description:**
An autonomous LLM agent should implement the corrective work in the following order.

1. Fix explicit-file search lane ownership in the fixed-string family.
2. Apply the same lane correction to the regex family.
3. Re-anchor shared search-policy wording and shared limit wording only where surface ownership must change.
4. Add the new `conventions/search-platform/` document set.
5. Update [`CONVENTIONS.md`](CONVENTIONS.md) TOC.
6. Align public runtime wording in:
   - [`register-inspection-tool-catalog.ts`](src/application/server/register-inspection-tool-catalog.ts)
   - [`server-instructions.ts`](src/application/server/server-instructions.ts)
7. Verify that preview-capable families and [`count_lines`](src/application/server/register-inspection-tool-catalog.ts:472) still match the accepted resume architecture after the search-platform fix.

---

### 3.12 CONST-001: Non-goals and forbidden solutions
[INTENT: CONSTRAINT]

**Type:** CONSTRAINT

**Description:**
The corrective implementation must not:

- raise [`REGEX_SEARCH_MAX_CANDIDATE_BYTES`](src/domain/shared/guardrails/tool-guardrail-limits.ts:491) blindly and call the task solved,
- raise family response caps or the global fuse,
- delete the search family hardgap concept entirely,
- widen read families into search-style behavior,
- move primary lane governance into prompt-only logic,
- reintroduce old `continuation*` vocabulary into future-state conventions,
- or treat the historical `__bak__` plan as the target-state authority.

---

## 4. Conventions & Constraints
[INTENT: CONSTRAINT]

- `ugrep` is the primary search backend for preview-capable search families.
- Large explicit text-compatible file search is architecturally allowed when the content state supports the requested operation.
- Recursive candidate workload admission remains server-owned and lane-based.
- The recursive candidate-byte hardgap is not the same thing as explicit-file search eligibility.
- `structuredContent` remains authoritative for `admission` and `resume` on resumable inspection families.
- `content.text` may be compact guidance only on resumable responses.
- [`count_lines`](src/application/server/register-inspection-tool-catalog.ts:472) remains completion-backed only and never emits preview-style partial totals.
- Read families remain bounded read contracts and do not adopt search-platform semantics.
- Family response caps and the global fuse remain authoritative and unchanged unless a separate architecture task explicitly changes them.
- Future-state conventions must document the architecture that should remain after refactoring, not the deleted/stale legacy surfaces.

---

## 5. File Path Index
[INTENT: REFERENCE]

| # | File Path | Relevance | Related Units |
|---|-----------|-----------|---------------|
| 1 | [`CONVENTIONS.md`](CONVENTIONS.md) | root convention TOC to update | REQ-005 |
| 2 | [`conventions/guardrails/overview.md`](conventions/guardrails/overview.md) | current guardrail layer baseline | REQ-002, INFO-001 |
| 3 | [`conventions/guardrails/mcp-client-governance.md`](conventions/guardrails/mcp-client-governance.md) | current large-file/client-governance baseline | REQ-002, INFO-001 |
| 4 | [`conventions/resume-architecture/overview.md`](conventions/resume-architecture/overview.md) | current resume-family target architecture | REQ-002, INFO-001 |
| 5 | [`conventions/resume-architecture/workflow.md`](conventions/resume-architecture/workflow.md) | current resume workflow baseline | INFO-001 |
| 6 | [`conventions/resume-architecture/guardrail-interaction.md`](conventions/resume-architecture/guardrail-interaction.md) | current mode-aware cap rule | INFO-001, INFO-003 |
| 7 | [`conventions/content-classification/overview.md`](conventions/content-classification/overview.md) | content-state taxonomy baseline | REQ-002, INFO-001 |
| 8 | [`conventions/content-classification/operation-capability-matrix.md`](conventions/content-classification/operation-capability-matrix.md) | content operation capability matrix | REQ-002, INFO-001 |
| 9 | [`conventions/mcp-response-contract/structured-content-contract.md`](conventions/mcp-response-contract/structured-content-contract.md) | structuredContent authority baseline | INFO-001, INFO-003 |
| 10 | [`src/domain/shared/guardrails/filesystem-preflight.ts`](src/domain/shared/guardrails/filesystem-preflight.ts) | shared preflight helpers and invalid candidate-byte blocker function | REQ-001, REQ-002 |
| 11 | [`src/domain/shared/guardrails/tool-guardrail-limits.ts`](src/domain/shared/guardrails/tool-guardrail-limits.ts) | shared variable and threshold registry | REQ-001, REQ-002, REQ-004 |
| 12 | [`src/domain/shared/guardrails/text-response-budget.ts`](src/domain/shared/guardrails/text-response-budget.ts) | projected/actual response budget helpers | REQ-002 |
| 13 | [`src/domain/shared/guardrails/traversal-workload-admission.ts`](src/domain/shared/guardrails/traversal-workload-admission.ts) | shared admission planner | REQ-002, INFO-003 |
| 14 | [`src/domain/shared/guardrails/traversal-preview-lane.ts`](src/domain/shared/guardrails/traversal-preview-lane.ts) | preview-lane helper | REQ-002 |
| 15 | [`src/domain/shared/guardrails/traversal-runtime-budget.ts`](src/domain/shared/guardrails/traversal-runtime-budget.ts) | deeper traversal safeguard | REQ-002 |
| 16 | [`src/domain/shared/guardrails/regex-search-safety.ts`](src/domain/shared/guardrails/regex-search-safety.ts) | regex structural safety | INFO-003 |
| 17 | [`src/domain/shared/search/search-execution-policy.ts`](src/domain/shared/search/search-execution-policy.ts) | shared search policy vocabulary | REQ-001, REQ-004 |
| 18 | [`src/domain/shared/search/inspection-content-state.ts`](src/domain/shared/search/inspection-content-state.ts) | shared content-state classifier and capability routing | REQ-002, INFO-003 |
| 19 | [`src/domain/shared/search/count-query-policy.ts`](src/domain/shared/search/count-query-policy.ts) | count execution split | INFO-003 |
| 20 | [`src/infrastructure/search/ugrep-command-builder.ts`](src/infrastructure/search/ugrep-command-builder.ts) | shared `ugrep` command plan | INFO-003, CONV-002 |
| 21 | [`src/infrastructure/search/ugrep-runner.ts`](src/infrastructure/search/ugrep-runner.ts) | shared `ugrep` runner | INFO-003, CONV-002 |
| 22 | [`src/infrastructure/filesystem/text-read-core.ts`](src/infrastructure/filesystem/text-read-core.ts) | read/backend separation baseline | CONV-002 |
| 23 | [`src/domain/inspection/search-file-contents-by-fixed-string/fixed-string-search-file-entry.ts`](src/domain/inspection/search-file-contents-by-fixed-string/fixed-string-search-file-entry.ts) | explicit-file fixed-string blocker | REQ-001, REQ-004 |
| 24 | [`src/domain/inspection/search-file-contents-by-fixed-string/handler.ts`](src/domain/inspection/search-file-contents-by-fixed-string/handler.ts) | fixed-string orchestration | REQ-003, REQ-004 |
| 25 | [`src/domain/inspection/search-file-contents-by-fixed-string/schema.ts`](src/domain/inspection/search-file-contents-by-fixed-string/schema.ts) | fixed-string request contract | REQ-003 |
| 26 | [`src/domain/inspection/search-file-contents-by-fixed-string/search-fixed-string-result.ts`](src/domain/inspection/search-file-contents-by-fixed-string/search-fixed-string-result.ts) | fixed-string formatted output and mode-aware caps | INFO-003 |
| 27 | [`src/domain/inspection/search-file-contents-by-regex/search-regex-path-result.ts`](src/domain/inspection/search-file-contents-by-regex/search-regex-path-result.ts) | explicit-file regex blocker | REQ-001, REQ-004 |
| 28 | [`src/domain/inspection/search-file-contents-by-regex/handler.ts`](src/domain/inspection/search-file-contents-by-regex/handler.ts) | regex orchestration | REQ-003, REQ-004 |
| 29 | [`src/domain/inspection/search-file-contents-by-regex/schema.ts`](src/domain/inspection/search-file-contents-by-regex/schema.ts) | regex request contract | REQ-003 |
| 30 | [`src/domain/inspection/search-file-contents-by-regex/search-regex-result.ts`](src/domain/inspection/search-file-contents-by-regex/search-regex-result.ts) | regex formatted output and mode-aware caps | INFO-003 |
| 31 | [`src/domain/inspection/list-directory-entries/handler.ts`](src/domain/inspection/list-directory-entries/handler.ts) | preview-capable discovery reference family | REQ-003, INFO-003 |
| 32 | [`src/domain/inspection/find-files-by-glob/handler.ts`](src/domain/inspection/find-files-by-glob/handler.ts) | preview-capable discovery reference family | REQ-003, INFO-003 |
| 33 | [`src/domain/inspection/find-paths-by-name/handler.ts`](src/domain/inspection/find-paths-by-name/handler.ts) | preview-capable discovery reference family | REQ-003, INFO-003 |
| 34 | [`src/domain/inspection/find-paths-by-name/helpers.ts`](src/domain/inspection/find-paths-by-name/helpers.ts) | preview-capable discovery reference family | REQ-003, INFO-003 |
| 35 | [`src/domain/inspection/count-lines/handler.ts`](src/domain/inspection/count-lines/handler.ts) | completion-backed reference family | REQ-003, INFO-003 |
| 36 | [`src/application/server/register-inspection-tool-catalog.ts`](src/application/server/register-inspection-tool-catalog.ts) | public endpoint inventory and wording | REQ-003, REQ-004 |
| 37 | [`src/application/server/server-instructions.ts`](src/application/server/server-instructions.ts) | server-level public runtime wording | REQ-004 |
| 38 | [`src/application/server/filesystem-server.ts`](src/application/server/filesystem-server.ts) | global fuse shell | INFO-003 |
| 39 | [`src/domain/shared/resume/inspection-resume-contract.ts`](src/domain/shared/resume/inspection-resume-contract.ts) | accepted resume-session contract | INFO-001, INFO-003 |
| 40 | [`src/infrastructure/persistence/inspection-resume-session-sqlite-store.ts`](src/infrastructure/persistence/inspection-resume-session-sqlite-store.ts) | accepted resume-session store | INFO-001, INFO-003 |
| 41 | [`src/domain/shared/continuation/inspection-continuation-contract.ts`](src/domain/shared/continuation/inspection-continuation-contract.ts) | stale old continuation contract | INFO-002 |
| 42 | [`src/infrastructure/persistence/inspection-continuation-sqlite-store.ts`](src/infrastructure/persistence/inspection-continuation-sqlite-store.ts) | stale old continuation store | INFO-002 |
| 43 | [`__bak__/plan-ugrep/PLAN.md`](__bak__/plan-ugrep/PLAN.md) | historical lineage baseline | INFO-001, INFO-002 |
| 44 | [`PLAN.md`](PLAN.md) | root architecture-plan surface | INFO-001, INFO-002 |
| 45 | [`.plan/1-runtime-architecture-refactors/orchestration.md`](.plan/1-runtime-architecture-refactors/orchestration.md) | unit runtime-refactor lifecycle surface | INFO-001, INFO-002 |

---

## 6. Execution Context for LLM Agents
[INTENT: CONTEXT]

An autonomous LLM agent consuming this document must use the following execution model.

### 6.1 Primary Objective

Implement the **search-platform correction** so that explicit large text-compatible file search on the preview-capable regex and fixed-string families is no longer blocked by the current recursive candidate-byte hardgap model.

### 6.2 Required Guardrails While Implementing

- Do not widen read-family contracts.
- Do not weaken family response caps.
- Do not weaken the global fuse.
- Do not remove unsupported-state refusal.
- Do not use historical `__bak__` task files as target-state authority.
- Do not add compatibility shims for the old `continuation*` vocabulary into future-state conventions.

### 6.3 Required Verification Logic

The agent must verify all of the following after implementation:

1. A large explicit SQL file on the fixed-string family no longer dies at the old 32 MiB candidate-byte preflight gate when its content state is supported.
2. The same large explicit SQL file on the regex family no longer dies at the same pre-scan gate for the same reason.
3. Recursive discovery/search/count families still preserve their shared admission and resume architecture.
4. `structuredContent` remains authoritative for resumable metadata.
5. [`count_lines`](src/application/server/register-inspection-tool-catalog.ts:472) remains completion-backed only.
6. The new `conventions/search-platform/` set documents only the future-state architecture.

### 6.4 Non-goals

- Do not solve the issue by inflating candidate-byte or response caps globally.
- Do not replace `ugrep` with a different primary search backend.
- Do not unify search and read into one backend abstraction.
- Do not document deleted legacy behavior as future-state convention text.

---

## 7. Implementation Target Map
[INTENT: REFERENCE]

### 7.1 Mandatory Code Changes

| File | Current Invalid / Incomplete State | Required Target Change |
|------|------------------------------------|------------------------|
| [`src/domain/inspection/search-file-contents-by-fixed-string/fixed-string-search-file-entry.ts`](src/domain/inspection/search-file-contents-by-fixed-string/fixed-string-search-file-entry.ts) | request-aggregate candidate-byte hardgap is enforced in the file-entry search helper itself, which also powers explicit-file search | move or gate the aggregate hardgap so explicit file search on supported text states is not refused before `ugrep` runs |
| [`src/domain/inspection/search-file-contents-by-regex/search-regex-path-result.ts`](src/domain/inspection/search-file-contents-by-regex/search-regex-path-result.ts) | same invalid hardgap ownership pattern exists on the regex explicit-file path | split explicit-file eligibility from recursive aggregate candidate-governance |
| [`src/domain/shared/search/search-execution-policy.ts`](src/domain/shared/search/search-execution-policy.ts) | same service hardgap value is reused for regex and fixed-string without clear distinction between recursive aggregate governance and explicit-file scan eligibility | document and, if necessary, refactor policy ownership so sync caps, recursive aggregate hardgaps, and explicit-file search eligibility are separate architectural concepts |
| [`src/domain/shared/guardrails/tool-guardrail-limits.ts`](src/domain/shared/guardrails/tool-guardrail-limits.ts) | current variable naming implies a single generic search candidate hardgap surface | keep the registry central and make the variable role reflect the correct surface ownership; do not move same-concept values out of the shared registry |
| [`src/application/server/register-inspection-tool-catalog.ts`](src/application/server/register-inspection-tool-catalog.ts) | public wording still describes broad search refusal generically and does not explain the future-state `ugrep` / preflight lane model clearly enough | align endpoint descriptions to the corrected search-platform architecture |
| [`src/application/server/server-instructions.ts`](src/application/server/server-instructions.ts) | server-level runtime wording does not explicitly distinguish explicit-file search from recursive candidate admission | align server wording to the corrected search-platform architecture |

### 7.2 Mandatory Convention Additions

| File | Required Action |
|------|-----------------|
| `conventions/search-platform/overview.md` | add as new file |
| `conventions/search-platform/endpoint-family-lane-matrix.md` | add as new file |
| `conventions/search-platform/preflight-and-hardgap-governance.md` | add as new file |
| `conventions/search-platform/threshold-and-variable-registry.md` | add as new file |
| [`CONVENTIONS.md`](CONVENTIONS.md) | update root TOC to link the new search-platform documents |

### 7.3 Reference-Only / Must-Preserve Surfaces

| File | Why it is reference-only for this task |
|------|---------------------------------------|
| [`src/domain/inspection/list-directory-entries/handler.ts`](src/domain/inspection/list-directory-entries/handler.ts) | preview-capable discovery reference family; do not invent unrelated behavior changes |
| [`src/domain/inspection/find-files-by-glob/handler.ts`](src/domain/inspection/find-files-by-glob/handler.ts) | preview-capable discovery reference family; keep lane model aligned |
| [`src/domain/inspection/find-paths-by-name/handler.ts`](src/domain/inspection/find-paths-by-name/handler.ts) | preview-capable discovery reference family; keep lane model aligned |
| [`src/domain/inspection/count-lines/handler.ts`](src/domain/inspection/count-lines/handler.ts) | completion-backed reference family; do not normalize into preview-family behavior |
| [`src/domain/inspection/read-file-content/handler.ts`](src/domain/inspection/read-file-content/handler.ts) | bounded read-family preflight remains correct |
| [`src/domain/inspection/read-files-with-line-numbers/handler.ts`](src/domain/inspection/read-files-with-line-numbers/handler.ts) | bounded read-family preflight remains correct |

### 7.4 Stale / Legacy Surfaces to Remove from Future-State Authority

| File | Status in this report |
|------|-----------------------|
| [`src/domain/shared/continuation/inspection-continuation-contract.ts`](src/domain/shared/continuation/inspection-continuation-contract.ts) | stale legacy surface; do not mirror into new conventions |
| [`src/infrastructure/persistence/inspection-continuation-sqlite-store.ts`](src/infrastructure/persistence/inspection-continuation-sqlite-store.ts) | stale legacy surface; do not mirror into new conventions |
| [`__bak__/plan-ugrep/PLAN.md`](__bak__/plan-ugrep/PLAN.md) and child tasks | historical lineage only |

---

## 8. Draft Convention Files (Future-State Only)
[INTENT: SPECIFICATION]

### 8.1 Root TOC update for [`CONVENTIONS.md`](CONVENTIONS.md)
[INTENT: REFERENCE]

Add the following rows to the root table of contents in [`CONVENTIONS.md`](CONVENTIONS.md):

```markdown
| [Search Platform Overview](conventions/search-platform/overview.md) | Ugrep search architecture, endpoint-family search roles, explicit-file versus recursive lane model, and search/read/count boundaries |
| [Search Platform Endpoint Lane Matrix](conventions/search-platform/endpoint-family-lane-matrix.md) | Complete affected endpoint matrix, lane capabilities, resume modes, refusal surfaces, and supported large-file behaviors |
| [Search Platform Preflight and Hardgap Governance](conventions/search-platform/preflight-and-hardgap-governance.md) | Correct preflight ownership, recursive admission lanes, explicit-file search entry rules, and hardgap boundaries |
| [Search Platform Threshold and Variable Registry](conventions/search-platform/threshold-and-variable-registry.md) | Canonical search-platform variables, family thresholds, hardgaps, sync caps, response caps, and their intended ownership |
```

---

### 8.2 Draft file: `conventions/search-platform/overview.md`
[INTENT: SPECIFICATION]

```markdown
# Search Platform Overview

> **Context:** See [`CONVENTIONS.md`](../../CONVENTIONS.md) for the root conventions index.  
> **Related guardrails:** See [`conventions/guardrails/overview.md`](../guardrails/overview.md) for the full guardrail stack.  
> **Related resume model:** See [`conventions/resume-architecture/overview.md`](../resume-architecture/overview.md) for the shared resume-session architecture.

---

## Purpose

This document defines the target-state search-platform architecture for the MCP Filesystem Extended server.

It is authoritative for:

- the role of `ugrep` in the inspection platform,
- the split between search, read, and count concerns,
- the distinction between explicit-file search and recursive traversal search,
- the lane model used by preview-capable search families,
- and the non-negotiable future-state architecture for large text-compatible file search.

---

## Core Architecture Statement

The search platform has three distinct concerns:

| Concern | Primary backend | Primary contract |
|---|---|---|
| Search | `ugrep` | bounded search result surface plus lane-specific resume behavior |
| Read | shared text-read core and streaming readers | bounded content-access surface |
| Count | streaming line counter for total-only, shared native-search lane for pattern-aware | bounded counting surface |

These concerns must not be collapsed into one generic large-file engine.

---

## Primary Search Backend Rule

`ugrep` is the primary search backend for preview-capable search families.

This means:

- literal search uses the shared fixed-string lane,
- regex search uses the shared regex lane,
- pattern-aware count behavior may reuse the shared native-search lane where explicitly modeled,
- and large text-search workloads must not fall back to whole-file in-process JavaScript search merely because the file is large.

---

## Explicit-File Search Versus Recursive Search

The architecture distinguishes two very different search surfaces.

### 1. Explicit-file search

An explicit-file search request names one file directly.

For this surface:

- the file is validated,
- the content state is classified,
- supported text-compatible states may proceed to the shared search backend,
- result size remains bounded by `maxResults`, family response caps, resume-mode behavior, and the global fuse,
- and large file byte size alone is not a sufficient reason to reject the search before the backend is allowed to execute.

### 2. Recursive traversal search

A recursive traversal search request names one or more directories and lets the server discover candidate files beneath them.

For this surface:

- the shared traversal admission planner decides whether the workload is `inline`, `preview-first`, `completion-backed-required`, or `narrowing-required`,
- candidate aggregate evidence, traversal breadth, and projected output surface all participate,
- preview-family resume modes are available where the family supports them,
- and the deeper traversal runtime fuse remains a final emergency safeguard.

These surfaces must not be treated as the same hardgap boundary.

---

## Preview-Capable Search Families

The preview-capable search families are:

| Endpoint | Role |
|---|---|
| `search_file_contents_by_regex` | regex content search |
| `search_file_contents_by_fixed_string` | literal content search |

These families support:

- `resumeMode = 'next-chunk'`
- `resumeMode = 'complete-result'`

Both remain same-endpoint and token-only resume surfaces.

---

## Large-File Rule

The target-state architecture explicitly allows large text-compatible file search when:

- the file content state is eligible for the requested search operation,
- the pattern/literal is valid for runtime execution,
- the response surface remains bounded,
- and the server-owned guardrails are not crossed.

The architecture does **not** say:

> "Large file size alone means the search endpoint must refuse before the search backend runs."

That behavior is invalid for explicit-file search on supported text-compatible surfaces.

---

## Relationship to Resume and Structured Response Authority

When a preview-capable search family returns a resumable response:

- `structuredContent.admission` and `structuredContent.resume` remain authoritative,
- the preview payload remains authoritative in `structuredContent`,
- `content.text` may be compact guidance only,
- and caller-visible resume guidance appears only when the response is actually resumable and carries a non-null token.

---

## Non-Negotiable Invariants

1. Search remains distinct from read.
2. Search remains distinct from total-only counting.
3. `ugrep` remains the primary search backend.
4. Explicit-file search and recursive traversal search do not share the same hardgap semantics.
5. Family response caps and the global fuse remain authoritative.
6. Read families do not inherit search-family pre-scan hardgap semantics.
```

---

### 8.3 Draft file: `conventions/search-platform/endpoint-family-lane-matrix.md`
[INTENT: SPECIFICATION]

```markdown
# Search Platform Endpoint Lane Matrix

> **Context:** See [`overview.md`](./overview.md) for the search-platform architecture baseline.

---

## Purpose

This document provides the endpoint-family capability and lane matrix for the search platform and its immediately adjacent inspection families.

---

## Matrix

| Endpoint | Family type | Primary backend | Explicit-file large text search | Recursive admission | Supported resume modes | Hard refusal still valid when |
|---|---|---|---|---|---|---|
| `search_file_contents_by_fixed_string` | preview-capable search | `ugrep` literal lane | allowed on supported text states | yes | `next-chunk`, `complete-result` | unsupported content state, invalid request, structural/runtime failure, final caps/fuse |
| `search_file_contents_by_regex` | preview-capable search | `ugrep` regex lane | allowed on supported text states | yes | `next-chunk`, `complete-result` | unsupported content state, unsafe regex, runtime failure, final caps/fuse |
| `list_directory_entries` | preview-capable discovery | filesystem traversal | not applicable | yes | `next-chunk`, `complete-result` | narrowing-required, deeper fuse, final caps/fuse |
| `find_files_by_glob` | preview-capable discovery | filesystem traversal | not applicable | yes | `next-chunk`, `complete-result` | narrowing-required, deeper fuse, final caps/fuse |
| `find_paths_by_name` | preview-capable discovery | filesystem traversal | not applicable | yes | `next-chunk`, `complete-result` | narrowing-required, deeper fuse, final caps/fuse |
| `count_lines` | completion-backed only | streaming counter or shared native-search lane | file reads/counts are bounded by counting semantics, not by preview-family text search rules | yes | `complete-result` only | unsupported content state, invalid request, final caps/fuse |
| `read_file_content` | bounded read family | text-read core + streaming readers | not a search family | no | none | projected/actual read budgeting, unsupported content state |
| `read_files_with_line_numbers` | bounded read family | text-read core | not a search family | no | none | projected/actual read budgeting, unsupported content state |

---

## Interpretation Rules

### Preview-capable search families

For the two search families:

- explicit-file eligibility is determined first by path validation, content-state compatibility, and runtime search safety,
- recursive workloads use the shared traversal admission planner,
- caller-visible output remains bounded by family caps and the global fuse,
- resumable responses expose `next-chunk` and `complete-result`.

### Discovery families

The discovery families do not use `ugrep`. Their breadth is controlled by traversal admission, preview-lane runtime budgets, and the same resume-session architecture.

### Count family

`count_lines` is intentionally distinct:

- no preview-style partial totals,
- completion-backed only once it leaves inline,
- same-endpoint resume still applies,
- but the family does not become a preview-family payload surface.

### Read families

Read families are not part of the search-platform lane model and must not inherit explicit-file search governance from the search families.

---

## Non-Negotiable Rules

1. The preview-capable search family set is exactly two endpoints.
2. The preview-capable discovery family set is exactly three endpoints.
3. `count_lines` remains completion-backed only.
4. Read families remain outside the search-platform resume/search governance.
5. Explicit-file large text search on supported content states is allowed on the search families.
```

---

### 8.4 Draft file: `conventions/search-platform/preflight-and-hardgap-governance.md`
[INTENT: SPECIFICATION]

```markdown
# Search Platform Preflight and Hardgap Governance

> **Context:** See [`overview.md`](./overview.md) for the search-platform baseline.  
> **Related:** See [`../guardrails/overview.md`](../guardrails/overview.md) for the wider guardrail stack.

---

## Purpose

This document defines which preflight and hardgap rules apply to which search-platform surfaces.

It exists to prevent one invalid simplification:

> treating recursive candidate aggregate governance and explicit-file search eligibility as if they were the same preflight problem.

---

## Correct Preflight Ownership Model

### Layer 1 — Schema request caps

Owner: request schema validation.

Use this layer for:

- path count,
- glob count,
- regex length,
- path length,
- result count fields.

### Layer 2 — Content-state eligibility

Owner: shared content-state classification.

Use this layer to determine whether the candidate file surface is:

- text-compatible enough for search,
- text-compatible enough for read,
- or unsupported for the requested operation.

### Layer 3 — Recursive traversal admission

Owner: shared traversal admission planner.

Use this layer only for workloads that require server-owned candidate discovery beneath directory roots.

Allowed outcomes:

- `inline`
- `preview-first`
- `completion-backed-required`
- `narrowing-required`

### Layer 4 — Explicit-file search entry rule

Owner: search family runtime lane.

For explicit file scopes:

- validate the path,
- validate the file type,
- classify the content state,
- run search runtime safety,
- and then execute the backend on supported states.

The explicit-file search entry rule must not reuse recursive candidate aggregate hardgap logic as a blanket refusal surface.

### Layer 5 — Preview-lane runtime budget

Owner: preview-family bounded traversal execution.

This layer remains valid only while the server is already inside a preview-family bounded traversal lane.

### Layer 6 — Family response caps and global fuse

Owner: shared response budgets and application shell.

This layer keeps caller-visible payloads bounded after lane selection and backend execution.

---

## Correct Hardgap Roles

### Still valid hardgap roles

The following remain valid:

1. malformed or abusive request-shape refusal,
2. unsupported content-state refusal,
3. recursive workload `narrowing-required` when server-owned traversal scope is too broad,
4. preview-lane bounded execution ceilings,
5. family response caps,
6. global response fuse.

### Invalid hardgap role

The following is invalid for the target state:

> a generic candidate-byte hard refusal that blocks an explicit large text-compatible file search before the shared `ugrep` backend is allowed to execute.

---

## Explicit-file Search Rule

For preview-capable search families:

- explicit file size alone is not a sufficient refusal reason,
- supported text-compatible states may proceed to the shared backend,
- result size remains bounded by caller-visible output controls,
- and recursive aggregate governance must not be reused as the explicit-file front-door hard stop.

---

## Recursive Search Rule

For directory-root search workloads:

- the shared traversal admission planner remains authoritative,
- recursive candidate evidence remains valid,
- preview-first and completion-backed behavior remain valid,
- narrowing-required remains valid when the workload is truly too broad,
- and the deeper traversal fuse remains the emergency safeguard.

---

## Non-Negotiable Prohibitions

1. Do not solve search-platform pressure by making every large explicit file unsearchable.
2. Do not solve the issue by raising global caps.
3. Do not solve the issue by weakening the global fuse.
4. Do not move primary scope estimation into prompt-only behavior.
5. Do not collapse explicit-file search and recursive traversal into one undifferentiated hardgap model.
```

---

### 8.5 Draft file: `conventions/search-platform/threshold-and-variable-registry.md`
[INTENT: SPECIFICATION]

```markdown
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
```

---

## 9. Final Execution Notes for the Implementing Agent
[INTENT: CONTEXT]

1. Treat this report as the working architecture reference.
2. Use the code-change map in **Section 7** as the mandatory file scope.
3. Use the convention drafts in **Section 8** as the future-state documentation source.
4. Do not copy stale/legacy surfaces into the new conventions.
5. Preserve the already-correct resume/session/content-state/structured-authority layers.
6. Fix the explicit-file preflight/hardgap ownership problem without weakening the server-owned safety model.
