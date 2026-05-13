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

The admission path must remain parameter-aware. Caller narrowing signals such as include-glob-constrained TypeScript search are not optional hints; they are part of the workload shape and must influence whether preflight cost is spent in a branch at all.

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

But the target architecture also requires that recursive preflight cost align with caller intent. If a request is already narrowed to `**/*.ts` / `**/*.tsx`, broad asset or icon branches must not dominate preflight cost as if they were equally relevant to the workload.

The implementation path for that rule is a workload-aware traversal preflight policy: directory discovery still proceeds, but file-entry budget accounting may ignore non-matching file leaves when strong include-glob narrowing is already present.

After that parameter-aware correction, the preflight soft-time ceiling is intentionally calibrated at `4,500 ms`. The old `3,000 ms` wall still rejected valid enterprise TypeScript and TSX broad-root search before the request could reach its proper admission lane, so the higher bounded value is now the architecture-correct preflight threshold.

The same target state also applies to preview-family completion: once the caller resumes with `resumeMode = 'complete-result'`, the completion branch must not inherit the legacy five-second local soft runtime timeout. The caller-visible completion ceiling is the global fuse, while deeper breadth safeguards remain internal emergency stabilizers only.

For the search families, that same completion branch may materialize the remaining native-eligible candidate surface into one ordered execution plan and then search it through one large or a few manifest-backed native `ugrep` batches. Decoded-text fallback files remain a smaller ordered side-lane instead of forcing the entire completion pass back into many tiny native batch flushes.

---

## Non-Negotiable Prohibitions

1. Do not solve search-platform pressure by making every large explicit file unsearchable.
2. Do not solve the issue by raising global caps.
3. Do not solve the issue by weakening the global fuse.
4. Do not move primary scope estimation into prompt-only behavior.
5. Do not collapse explicit-file search and recursive traversal into one undifferentiated hardgap model.
