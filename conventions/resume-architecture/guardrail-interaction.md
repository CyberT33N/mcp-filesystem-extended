# Guardrail–Resume Interaction

> **Context:** See [`CONVENTIONS.md`](../../CONVENTIONS.md) for the full conventions index and core invariants.  
> **Guardrail layers:** [`conventions/guardrails/overview.md`](../guardrails/overview.md) for all guardrail definitions and limits.  
> **Workflow flows:** [`conventions/resume-architecture/workflow.md`](./workflow.md) for step-by-step execution paths.

---

## The Core Rule: Mode-Aware Response Cap Selection

For the six resume-capable inspection endpoints, the family-level response cap (guardrail Layer 5) must be conditioned on the active delivery mode.

### Why the Unconditional Family Cap Is Wrong in `complete-result` Mode

The family-level caps (`DISCOVERY_RESPONSE_CAP_CHARS = 150,000`, `REGEX_SEARCH_RESPONSE_CAP_CHARS = 120,000`) were originally designed for a world without resume sessions. Their purpose is to protect the caller's context window in inline and chunk responses.

When the caller explicitly sends `resumeMode = 'complete-result'`, the contract has changed:

1. The caller **already knows** the workload is large (they received a preview-first or completion-backed response in a prior call).
2. The caller has **explicitly agreed** on the contract by sending a resume-only request with `resumeMode = 'complete-result'`.
3. The server has **confirmed** the contract by issuing a `resumeToken` and populating `resume.supportedResumeModes`.

Applying the 150,000-character family cap to a `complete-result` response blocks a valid server-owned completion attempt with an error that is architecturally incorrect — because the actual safety ceiling for this mode is the global fuse at 600,000 characters.

### The Correct Implementation

For every resume-capable handler that calls `assertActualTextBudget` on its text output, the cap selection must be conditional:

```typescript
// In any resume-capable handler (list_directory_entries, find_files_by_glob,
// find_paths_by_name, count_lines, etc.):

const isCompleteResultMode =
  requestedResumeMode === INSPECTION_RESUME_MODES.COMPLETE_RESULT;
const effectiveResponseCap = isCompleteResultMode
  ? GLOBAL_RESPONSE_HARD_CAP_CHARS   // 600,000 — non-bypassable global floor
  : FAMILY_RESPONSE_CAP_CHARS;       // e.g. 150,000 — correct for inline + next-chunk

assertActualTextBudget(
  toolName,
  output.length,
  effectiveResponseCap,
  "description of the text surface",
);
```

### Which Handlers Must Apply This Rule

All six resume-capable inspection endpoints whose handler calls `assertActualTextBudget` on caller-visible text output:

| Handler | File | Family cap constant | Cap applies in |
|---|---|---|---|
| `list_directory_entries` | [`src/domain/inspection/list-directory-entries/handler.ts`](../../src/domain/inspection/list-directory-entries/handler.ts) | `DISCOVERY_RESPONSE_CAP_CHARS` | inline, next-chunk only |
| `find_files_by_glob` | [`src/domain/inspection/find-files-by-glob/handler.ts`](../../src/domain/inspection/find-files-by-glob/handler.ts) | `DISCOVERY_RESPONSE_CAP_CHARS` | inline, next-chunk only |
| `find_paths_by_name` | [`src/domain/inspection/find-paths-by-name/handler.ts`](../../src/domain/inspection/find-paths-by-name/handler.ts) | `DISCOVERY_RESPONSE_CAP_CHARS` | inline, next-chunk only |
| `count_lines` (final output) | [`src/domain/inspection/count-lines/handler.ts`](../../src/domain/inspection/count-lines/handler.ts) | `DISCOVERY_RESPONSE_CAP_CHARS` | inline final output only |

**Note on search endpoints:** `search_file_contents_by_regex` and `search_file_contents_by_fixed_string` delegate response-budget enforcement to `assertFormattedRegexResponseBudget` / `assertFormattedFixedStringResponseBudget` in their result modules. In `complete-result` mode, the text output for these families is a compact progress summary (not the full match payload), so the cap typically does not fire in practice. The rule still applies architecturally and should be addressed if the output format changes to include full match payloads in `complete-result` mode.

---

## Which Guardrails Are Active in Each Mode

### Inline Mode

| Guardrail | Active? | Notes |
|---|---|---|
| Schema caps (Layer 1) | ✅ | Always |
| Admission decision (Layer 2) | ✅ | Routes to inline outcome |
| Candidate workload probe (Layer 3) | ✅ | Used for admission input |
| Preview runtime budget (Layer 4) | ❌ | No preview execution in inline mode |
| Family-level response cap (Layer 5) | ✅ | Full inline output is subject to family cap |
| Global fuse (Layer 6) | ✅ | Always |

### `next-chunk` Mode

| Guardrail | Active? | Notes |
|---|---|---|
| Schema caps (Layer 1) | ✅ | Always |
| Admission decision (Layer 2) | ✅ | Re-evaluated against persisted payload |
| Candidate workload probe (Layer 3) | ✅ | Re-run for admission input |
| Preview runtime budget (Layer 4) | ✅ | Bounds the chunk traversal |
| Family-level response cap (Layer 5) | ✅ | Chunk text output is subject to family cap |
| Global fuse (Layer 6) | ✅ | Always |

### `complete-result` Mode (Preview Families)

| Guardrail | Active? | Notes |
|---|---|---|
| Schema caps (Layer 1) | ✅ | Always |
| Admission decision (Layer 2) | ✅ | Re-evaluated; still routes to PREVIEW_FIRST, which activates the complete-result branch |
| Candidate workload probe (Layer 3) | ✅ | Re-run for admission input |
| Preview runtime budget (Layer 4) | ❌ | Not used; full traversal path is active |
| Deep traversal emergency budget | ✅ | 500K entries, 50K dirs, 5s — emergency safeguard during full traversal |
| Family-level response cap (Layer 5) | ❌ | **Must not fire** — see mode-aware rule above |
| Global fuse (Layer 6) | ✅ | Always — this is the only ceiling in this mode |

### `complete-result` Mode (`count_lines`)

| Guardrail | Active? | Notes |
|---|---|---|
| Schema caps (Layer 1) | ✅ | Always |
| Admission decision (Layer 2) | ✅ | Re-evaluated; routes to COMPLETION_BACKED_REQUIRED |
| Candidate workload probe (Layer 3) | ✅ | Re-run for admission input |
| Preview runtime budget (Layer 4) | ❌ | `count_lines` has no preview mode |
| Task-backed chunk runtime limits | ✅ | Execution policy limits used as chunk boundaries in `countLinesInDirectoryTaskBacked` |
| Family-level response cap (Layer 5) | ✅ on final aggregated output only | Applied only when `paths` is non-empty (final result exists) |
| Global fuse (Layer 6) | ✅ | Always |

---

## Admission-Layer Timeouts Are Not a Conflict

The proactive admission decision (Layer 2) re-runs on every resume request, including `complete-result` requests. This is correct and intentional:

- The admission layer is **routing logic**, not a blocking guard for `complete-result` execution.
- A `PREVIEW_FIRST` admission outcome in a resume request **activates** the `complete-result` branch in the handler — it does not block it.
- The admission layer ensures that the handler knows whether it is in a preview-capable, completion-backed, or narrowing-required situation before selecting the execution path.

The admission timeouts that informed the original `PREVIEW_FIRST` routing decision are part of this logic and remain architecturally correct. They were never designed to block `complete-result` execution — that conflict arose only when the family-level response cap was applied unconditionally without checking the delivery mode.

---

## The Global Fuse as the Exclusive `complete-result` Ceiling

In `complete-result` mode, the following guarantee holds:

> The **only** server-owned hard ceiling on the response size is `GLOBAL_RESPONSE_HARD_CAP_CHARS = 600,000`.

If a `complete-result` response exceeds 600,000 characters, the server shell triggers the global fuse and returns a structured guardrail refusal with `isError = true`. The caller must then reduce scope.

This is the intended behavior. A response of, for example, 163,215 characters (as in the observed conflict case) is well within the 600,000-character global fuse and must never be blocked by a 150,000-character family cap that is not aware of the delivery mode.

---

## Summary of the Altlast Pattern and the Fix

**Altlast (legacy conflict):** The family-level `assertActualTextBudget` call in resume-capable handlers was written before the `complete-result` delivery mode existed. It fires unconditionally, treating inline, `next-chunk`, and `complete-result` responses identically.

**Consequence:** A valid `complete-result` response of, for example, 163,215 characters is blocked by the 150,000-character `DISCOVERY_RESPONSE_CAP_CHARS` even though the global fuse at 600,000 would permit it and even though the caller explicitly contracted for the complete result via the resume-session protocol.

**Fix:** Make the cap selection conditional on `requestedResumeMode`. In `complete-result` mode, use `GLOBAL_RESPONSE_HARD_CAP_CHARS` as the effective cap. In all other modes, use the family-specific cap. The global fuse remains active as the absolute non-bypassable ceiling in all modes.

**What does not change:** The admission-layer timeouts, the preview runtime budget, the deep traversal emergency budget, the global fuse, and all schema-level caps remain unchanged and continue to serve their correct architectural roles.
