# Public Limit Disclosure Governance

> **Context:** See [`CONVENTIONS.md`](../../CONVENTIONS.md) for the root conventions index and core invariants.
> **Related:** See [`overview.md`](./overview.md) for the shared guardrail stack and limit inventory.
> **Related:** See [`mcp-client-governance.md`](./mcp-client-governance.md) for the L1/L2 client-governance model and the direct-read family rationale.
> **Related:** Endpoint-local disclosure decisions must be re-referenced from each endpoint-specific [`CONVENTIONS.md`](../../src/domain/inspection/read-file-content/CONVENTIONS.md) and reflected in each corresponding [`DESCRIPTION.md`](../../src/domain/inspection/read-file-content/DESCRIPTION.md).

---

## Purpose

This document is the global single source of truth for **public limit disclosure** in the MCP Filesystem Extended project.

It defines:

1. **which limits belong in public MCP tool contracts**,
2. **where those limits must be disclosed**,
3. **which limits must stay out of routine tool descriptions**,
4. **how endpoint-local `CONVENTIONS.md` and `DESCRIPTION.md` surfaces must specialize the global rule**,
5. and **why the architecture intentionally separates caller-actionable contract limits from server-internal guardrail mechanics**.

This document does **not** replace endpoint-local rationale. It owns the global disclosure policy. Endpoint-local files own the endpoint-specific application of that policy.

---

## Core Architectural Decision

The MCP server must disclose **stable, caller-actionable limits** before the caller fails on them.

The MCP server must **not** indiscriminately disclose every internal guardrail or runtime fuse as if all of them were equally relevant at tool-call construction time.

### Binding decision

| Decision surface | Global decision |
|---|---|
| Stable request-shape limits that directly constrain one public field | **Disclose in the parameter description** |
| Stable operation-wide or response-family limits that shape retry planning | **Disclose in the tool description** |
| Mode-aware output rules that change by delivery mode | **Disclose in the tool description with explicit mode conditioning** |
| Dynamic, tier-dependent, emergency, sampling, or assertion-like internal guardrails | **Do not prioritize in routine tool descriptions** |
| Exact endpoint-specific disclosure rationale | **Document in the endpoint-local `CONVENTIONS.md` and reflect in the endpoint-local `DESCRIPTION.md`** |

### Why this decision exists

An MCP client, especially an LLM agent, makes two distinct decisions:

1. **tool selection**
2. **argument construction**

These are different cognitive steps.

Therefore:

- **parameter descriptions** must answer: *What exact values can I legally send for this field?*
- **tool descriptions** must answer: *What kind of bounded result surface or fallback contract does this whole operation have?*

When the server hides a stable, caller-actionable limit until the refusal surface appears, the client spends an unnecessary reasoning turn on recovery. That increases token consumption, error branching, and hallucination risk.

---

## Limit Taxonomy

Public disclosure decisions must differentiate between four architectural limit classes.

### Class A — Public request-contract limits

These are schema-level limits that directly constrain a public request field or public batch container.

Examples from [`tool-guardrail-limits.ts`](../../src/domain/shared/guardrails/tool-guardrail-limits.ts):

- `PATH_MAX_CHARS = 4,096`
- `GLOB_PATTERN_MAX_CHARS = 1,024`
- `REGEX_PATTERN_MAX_CHARS = 2,048`
- `HASH_STRING_MAX_CHARS = 256`
- `RAW_CONTENT_MAX_CHARS = 150,000`
- `REPLACEMENT_TEXT_MAX_CHARS = 100,000`
- `MAX_INCLUDE_GLOBS_PER_REQUEST = 32`
- `MAX_EXCLUDE_GLOBS_PER_REQUEST = 64`
- `MAX_GENERIC_PATHS_PER_REQUEST = 512`
- `MAX_DISCOVERY_ROOTS_PER_REQUEST = 128`
- `MAX_REGEX_ROOTS_PER_REQUEST = 64`
- `MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST = 200`
- `MAX_CONTENT_FILES_PER_REQUEST = 50`
- `MAX_COMPARISON_PAIRS_PER_REQUEST = 25`
- `MAX_RAW_TEXT_DIFF_PAIRS_PER_REQUEST = 10`
- `MAX_REPLACEMENTS_PER_FILE = 25`
- `DISCOVERY_MAX_RESULTS_HARD_CAP = 1,000`
- `MAX_TOTAL_RAW_TEXT_REQUEST_CHARS = 400,000`
- `LINE_REPLACEMENT_TOTAL_INPUT_CHARS = 300,000`

**Policy:** These limits must be disclosed where the caller builds the affected field or batch payload.

**Primary placement:** parameter descriptions.

### Class B — Public response-family limits

These are stable output-family ceilings that shape the whole caller-visible result surface and therefore materially affect retry planning.

Examples from [`tool-guardrail-limits.ts`](../../src/domain/shared/guardrails/tool-guardrail-limits.ts):

- `READ_FILES_RESPONSE_CAP_CHARS = 450,000`
- `READ_FILE_CONTENT_RESPONSE_CAP_CHARS = 450,000`
- `REGEX_SEARCH_RESPONSE_CAP_CHARS = 120,000`
- `FIXED_STRING_SEARCH_RESPONSE_CAP_CHARS = 120,000`
- `DISCOVERY_RESPONSE_CAP_CHARS = 150,000`
- `METADATA_RESPONSE_CAP_CHARS = 100,000`
- `COUNT_LINES_RESPONSE_CAP_CHARS = 100,000`
- `FILE_DIFF_RESPONSE_CAP_CHARS = 300,000`
- `TEXT_DIFF_RESPONSE_CAP_CHARS = 240,000`
- `PATH_MUTATION_SUMMARY_CAP_CHARS = 60,000`

**Policy:** These limits must be disclosed when they materially help the caller choose the right operation shape, split strategy, or fallback path.

**Primary placement:** tool descriptions.

### Class C — Mode-aware delivery limits

These are limits whose applicability changes by delivery mode or endpoint lane.

Examples:

- preview-family response caps apply in `inline` and `next-chunk`
- preview-family `complete-result` uses the global fuse instead of the family cap
- `count_lines` is completion-backed-only once it leaves inline
- `read_file_content` may allow a legal `byteCount` request that still produces an oversized decoded output surface if the caller does not size the chunk conservatively

**Policy:** These rules must be disclosed in the tool description when the mode distinction changes caller planning.

**Primary placement:** tool descriptions, with explicit mode-aware wording.

### Class D — Internal runtime and emergency limits

These are server-internal admission, traversal, sampling, or emergency guardrails.

Examples:

- `GLOBAL_RESPONSE_HARD_CAP_CHARS = 600,000`
- `TRAVERSAL_PREFLIGHT_MAX_VISITED_ENTRIES`
- `TRAVERSAL_PREFLIGHT_MAX_VISITED_DIRECTORIES`
- `TRAVERSAL_PREFLIGHT_SOFT_TIME_BUDGET_MS`
- `TRAVERSAL_RUNTIME_MAX_VISITED_ENTRIES`
- `TRAVERSAL_RUNTIME_MAX_VISITED_DIRECTORIES`
- `TRAVERSAL_RUNTIME_SOFT_TIME_BUDGET_MS`
- tier-specific runtime budgets in [`search-execution-policy.ts`](../../src/domain/shared/search/search-execution-policy.ts)
- bounded sampling-window constants used by content-state classification

**Policy:** These limits remain documented in architecture and server-governance surfaces, but they are **not** routine per-tool contract material unless a narrower endpoint-local reason proves otherwise.

**Primary placement:** shared architecture conventions, server-governance documentation, and internal code comments.

---

## Placement Rules

## 1. Parameter Description Rule

A limit belongs in the **parameter description** when all of the following are true:

1. it constrains one public field, array, pair count, or batch count,
2. the caller can act on it directly while constructing the request,
3. the limit is stable enough to be part of the public request contract.

### Required placement examples

| Limit type | Correct placement |
|---|---|
| path max length | the path-bearing parameter description |
| regex length | the `regex` parameter description |
| raw-content max length | the `content`-bearing parameter description |
| replacements per file | the `replacements` container description |
| comparison-pair count | the `pairs` container description |
| discovery root count | the `roots` parameter description |

### Anti-pattern

Do **not** push field-local request caps up into the tool description as the only disclosure surface. That forces the caller to infer field legality from a broad narrative instead of from the parameter they are actively populating.

---

## 2. Tool Description Rule

A limit belongs in the **tool description** when all of the following are true:

1. it constrains the whole result surface or whole execution lane,
2. it changes retry planning, batching strategy, or fallback selection,
3. it is stable enough to remain a public operation-wide contract.

### Required placement examples

| Limit type | Correct placement |
|---|---|
| read-family response cap | tool description of the read-family endpoint |
| diff-family response cap | tool description of the diff endpoint |
| preview-family inline/preview cap | tool description of the preview-capable endpoint |
| designated fallback lane | tool description of the owning endpoint |
| mode-aware `complete-result` cap rule | tool description of the preview-capable endpoint |

### Anti-pattern

Do **not** bury operation-wide response ceilings only in refusal messages or only in deep architecture docs when the caller could have chosen a better tool shape before the call.

---

## 3. Endpoint-Local SSOT Rule

Each endpoint-local `CONVENTIONS.md` must explain:

1. **whether** the endpoint should expose request-field limits in parameter descriptions,
2. **whether** the endpoint should expose response-family limits in the tool description,
3. **which limit classes remain internal and therefore must not be promoted into routine tool descriptions**, and
4. **why** that endpoint follows that disclosure pattern.

Each endpoint-local `DESCRIPTION.md` must then reflect the resulting caller-facing contract without re-explaining the full global policy.

### Required ownership split

| Surface | Ownership |
|---|---|
| this document | global disclosure policy and placement rules |
| root [`CONVENTIONS.md`](../../CONVENTIONS.md) | TOC and re-reference |
| endpoint-local `CONVENTIONS.md` | endpoint-specific disclosure rationale |
| endpoint-local `DESCRIPTION.md` | caller-facing endpoint contract text |

---

## What Must Not Be Prioritized in Routine Tool Descriptions

## 1. Global fuse disclosure

The global fuse is real and non-bypassable, but it must **not** become the primary planning number in routine per-tool descriptions.

### Why

The global fuse is a **server-shell safeguard**, not the normal per-tool target surface.

If a tool family has a stricter family cap, publishing the global fuse as the dominant tool-level number creates the wrong optimization target for the caller.

Example:

- read-family cap: `450,000`
- global fuse: `600,000`

The caller should optimize around the read-family cap, not around the global fuse.

### Policy

- the existence of the global fuse may be documented in shared global conventions,
- the exact number may be referenced where architecturally necessary,
- but it must not replace the stricter family contract in routine endpoint-level tool descriptions.

## 2. Dynamic traversal and runtime tier budgets

Tier-specific and runtime-sensitive budgets from [`search-execution-policy.ts`](../../src/domain/shared/search/search-execution-policy.ts) must not be blindly promoted into public tool descriptions.

### Why

These values are:

- runtime-policy owned,
- tier-dependent,
- execution-lane dependent,
- and subject to re-calibration without changing the public caller contract.

Publishing them as ordinary tool-description numbers would overfit callers to unstable server internals.

## 3. Emergency traversal and assertion-like limits

Emergency traversal fuses, preflight breadth ceilings, and sampling internals must not be treated as ordinary tool-contract numbers.

### Why

These limits exist to protect the server when higher-level routing or caller behavior becomes pathological.

They are part of the **internal stability model**, not the normal tool-call construction surface.

---

## Endpoint-Family Disclosure Strategy

## 1. Read family — highest disclosure priority

### Endpoints

- [`read_file_content`](../../src/domain/inspection/read-file-content/CONVENTIONS.md)
- [`read_files_with_line_numbers`](../../src/domain/inspection/read-files-with-line-numbers/CONVENTIONS.md)

### Policy

These endpoints must be treated as the **highest-priority public limit-disclosure family**.

### Why

The read family is where hidden response ceilings cause the most retry churn, because the caller often sees a legal request field value but not the stricter response-family result surface.

### Required disclosure pattern

**Parameter descriptions must disclose:**

- mode-specific field caps,
- byte-count or range-field maxima,
- batch-size or path-count ceilings where relevant.

**Tool descriptions must disclose:**

- the `450,000` character read-family response cap,
- the fact that a legal request can still produce an oversized output surface,
- the designated fallback lane for oversized reads,
- and any mode-aware distinction that changes safe chunk sizing.

## 2. Search family — high, but mode-aware

### Endpoints

- [`search_file_contents_by_regex`](../../src/domain/inspection/search-file-contents-by-regex/CONVENTIONS.md)
- [`search_file_contents_by_fixed_string`](../../src/domain/inspection/search-file-contents-by-fixed-string/CONVENTIONS.md)

### Policy

These endpoints should disclose their bounded output behavior, but always **mode-aware**.

### Required disclosure pattern

**Parameter descriptions must disclose:**

- pattern length limits,
- root-count limits,
- glob-count limits,
- max-results fields.

**Tool descriptions should disclose:**

- that inline and `next-chunk` responses are bounded by the search-family response cap,
- that broad workloads may degrade into preview-first or `complete-result`,
- that `complete-result` is not a cap bypass,
- and that recursive breadth still follows shared admission and may require narrowing.

### Prohibition

Do not publish tier-specific candidate-byte or execution-time internals as if they were routine public caller targets.

## 3. Discovery family — bounded-output note, lower numeric priority

### Endpoints

- [`list_directory_entries`](../../src/domain/inspection/list-directory-entries/CONVENTIONS.md)
- [`find_files_by_glob`](../../src/domain/inspection/find-files-by-glob/CONVENTIONS.md)
- [`find_paths_by_name`](../../src/domain/inspection/find-paths-by-name/CONVENTIONS.md)

### Policy

These endpoints should explain bounded preview/output behavior and additive resume behavior, but numeric disclosure is a lower priority than in the read family.

### Required disclosure pattern

**Parameter descriptions must disclose:**

- root-count limits,
- glob limits,
- path limits,
- result-count limits.

**Tool descriptions may disclose:**

- that inline and preview delivery are bounded,
- that `complete-result` is additive,
- that broad scopes may require narrowing.

Numeric disclosure is acceptable when it materially helps caller planning, but it is not the primary global priority for this family.

## 4. Diff family — request plus response disclosure

### Endpoints

- [`diff_files`](../../src/domain/comparison/diff-files/CONVENTIONS.md)
- [`diff_text_content`](../../src/domain/comparison/diff-text-content/CONVENTIONS.md)

### Policy

The diff family should disclose both:

- request-side pair and raw-text budgets,
- and output-side family caps.

### Why

Diff workflows fail both from oversized caller-supplied payloads and from oversized rendered diff output.

### Required disclosure pattern

**Parameter descriptions must disclose:**

- pair-count limits,
- raw-content field limits,
- cumulative raw-text ceilings.

**Tool descriptions should disclose:**

- the diff-family response cap,
- that oversized comparison sets must be narrowed or split.

## 5. Count family — delivery-contract priority over numeric emphasis

### Endpoint

- [`count_lines`](../../src/domain/inspection/count-lines/CONVENTIONS.md)

### Policy

The most important public disclosure here is the **delivery contract**:

- inline when possible,
- completion-backed only once the workload leaves inline,
- no preview-style partial totals.

Numeric output-cap disclosure is acceptable, but the primary caller-value lies in understanding the lane model rather than optimizing around one visible number.

## 6. Metadata and integrity family — request disclosure first, tool-level numeric disclosure only when materially useful

### Endpoints

- [`get_path_metadata`](../../src/domain/inspection/get-path-metadata/CONVENTIONS.md)
- [`get_file_checksums`](../../src/domain/inspection/get-file-checksums/CONVENTIONS.md)
- [`verify_file_checksums`](../../src/domain/inspection/verify-file-checksums/CONVENTIONS.md)

### Policy

These endpoints should prioritize **request-shape disclosure** over aggressive tool-description numeric cap disclosure.

### Why

Their caller-visible outputs are usually compact. The more important planning question is whether the request shape is legal and correctly bounded.

## 7. Mutation family — request-shape disclosure first; summary-cap disclosure usually remains secondary

### Endpoints

- [`create_files`](../../src/domain/mutation/create-files/CONVENTIONS.md)
- [`append_files`](../../src/domain/mutation/append-files/CONVENTIONS.md)
- [`create_directories`](../../src/domain/mutation/create-directories/CONVENTIONS.md)
- [`copy_paths`](../../src/domain/mutation/copy-paths/CONVENTIONS.md)
- [`move_paths`](../../src/domain/mutation/move-paths/CONVENTIONS.md)
- [`delete_paths`](../../src/domain/mutation/delete-paths/CONVENTIONS.md)
- [`replace_file_line_ranges`](../../src/domain/mutation/replace-file-line-ranges/CONVENTIONS.md)

### Policy

Mutation endpoints should prioritize disclosure of:

- operation-count limits,
- per-file or per-replacement limits,
- cumulative input limits,
- refusal-on-existing or overwrite semantics.

The formatted mutation-summary cap usually remains a lower-priority disclosure surface because it is rarely the primary factor in tool selection or argument construction.

## 8. Application-owned scope-disclosure surface

### Endpoint

- [`list_allowed_directories`](../../src/application/server/list-allowed-directories/CONVENTIONS.md)

### Policy

This endpoint does not need the same public limit-disclosure emphasis as content-heavy or broad-result families.

Its local documentation should instead clarify why the endpoint is a scope-disclosure surface rather than a content, discovery, or mutation surface.

---

## Implementation Invariants

1. **Do not hardcode divergent disclosure text per endpoint when the underlying limit is shared.** Shared constants must remain the single source of truth.
2. **Do not expose dynamic internals as if they were stable public contract numbers.**
3. **Do not let the global fuse replace stricter family caps in endpoint descriptions.**
4. **Do not state mode-aware caps without naming the mode boundary explicitly.**
5. **Do not let endpoint-local docs contradict this global policy.**
6. **Do not let endpoint-local docs omit the rationale for non-disclosure when an endpoint intentionally does not prioritize a tool-description limit.**

---

## Required Re-Reference Pattern

When an endpoint applies this policy, the endpoint-local `CONVENTIONS.md` must re-reference this file and then state:

- which public limit classes the endpoint exposes in parameter descriptions,
- which public limit classes the endpoint exposes in the tool description,
- which internal limit classes remain intentionally non-prioritized in the tool description,
- and why that endpoint-specific choice is architecturally correct.

The endpoint-local `DESCRIPTION.md` must then express the resulting caller-facing contract without re-stating the whole policy tree.

---

## Final Rule

The public MCP contract must become **predictive** for stable, caller-actionable limits and remain **non-noisy** for unstable or internal guardrails.

That is the governing principle.

If a limit helps the caller choose the correct tool, correct mode, correct batch size, correct chunk size, or correct fallback path **before** failure, it belongs in the public contract at the correct surface.

If a limit exists primarily to protect server internals, traversal runtime, or emergency stability after higher-level planning has already gone wrong, it belongs in shared architecture documentation instead of routine tool descriptions.
