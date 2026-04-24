# Resume Architecture Overview

> **Context:** See [`CONVENTIONS.md`](../../CONVENTIONS.md) for the full conventions index and core invariants.  
> **Related:** [`conventions/guardrails/overview.md`](../guardrails/overview.md) for guardrail layers and limits.  
> **Workflow:** [`conventions/resume-architecture/workflow.md`](./workflow.md) for step-by-step execution flows.  
> **Guardrail interaction:** [`conventions/resume-architecture/guardrail-interaction.md`](./guardrail-interaction.md) for mode-aware cap rules.

---

## Purpose

The resume-session architecture exists to let autonomous LLM agents interact with large recursive filesystem workloads efficiently and correctly. Without it, broad traversals either fail silently or force agents into repeated expensive narrow retries.

The architecture gives every affected endpoint three first-class choices:

1. **Reduce scope** — narrow roots, tighten globs, add include/exclude filters. Always preferred over resuming.
2. **Get the next bounded chunk** (`resumeMode = 'next-chunk'`) — receive a preview chunk and resume incrementally.
3. **Ask the server to complete the result** (`resumeMode = 'complete-result'`) — continue the same server-owned session toward a complete result.

---

## Shared Contract Surfaces

### Public request fields

| Field | Purpose |
|---|---|
| `resumeToken` | Opaque server-owned session handle. Present only on resume requests. |
| `resumeMode` | Delivery intent. `'next-chunk'` or `'complete-result'`. Required on resume requests. |

### Public response envelope

| Field | Purpose |
|---|---|
| `admission.outcome` | Lane selected by the server: `inline`, `preview-first`, `completion-backed-required`, `narrowing-required` |
| `admission.guidanceText` | Server-owned guidance for the current bounded delivery or completion state |
| `admission.scopeReductionGuidanceText` | Scope-reduction guidance surfaced as a first-class alternative to resume |
| `resume.resumeToken` | Opaque session handle when the response is resumable |
| `resume.resumable` | Whether the caller may send a resume request for this response |
| `resume.status` | Session lifecycle state: `active`, `completed`, `cancelled`, `expired` |
| `resume.expiresAt` | Session expiration timestamp |
| `resume.supportedResumeModes` | Which `resumeMode` values the endpoint accepts for the active session |
| `resume.recommendedResumeMode` | Server hint for the most appropriate `resumeMode` |

**Source:** [`src/domain/shared/resume/inspection-resume-contract.ts`](../../src/domain/shared/resume/inspection-resume-contract.ts)

---

## Endpoint Families

### Preview-capable families (support both `next-chunk` and `complete-result`)

These five families route broad workloads through a preview-first admission lane and expose both resume intents:

| Family | Tool name | Supported resume modes |
|---|---|---|
| Directory listing | `list_directory_entries` | `next-chunk`, `complete-result` |
| Glob discovery | `find_files_by_glob` | `next-chunk`, `complete-result` |
| Name discovery | `find_paths_by_name` | `next-chunk`, `complete-result` |
| Regex search | `search_file_contents_by_regex` | `next-chunk`, `complete-result` |
| Fixed-string search | `search_file_contents_by_fixed_string` | `next-chunk`, `complete-result` |

**Scope reduction guidance per family:**

| Family | Scope reduction |
|---|---|
| `list_directory_entries` | Narrow `roots`, choose a deeper root, or set `recursive = false` |
| `find_files_by_glob` | Narrow `roots`, tighten `glob`, or reduce reopened descendants through `includeExcludedGlobs` |
| `find_paths_by_name` | Narrow `roots` or make `nameContains` more specific |
| `search_file_contents_by_regex` | Narrow `roots`, add `includeGlobs`, or tighten the regex to the intended file set |
| `search_file_contents_by_fixed_string` | Narrow `roots`, add `includeGlobs`, or reduce the scope to the relevant subtree |

### Completion-backed-only family

`count_lines` is intentionally distinct. It never emits preview-style partial totals. When a broad workload exceeds inline admission it enters `completion-backed-required` directly and supports only `resumeMode = 'complete-result'`.

| Family | Tool name | Supported resume modes |
|---|---|---|
| Line counting | `count_lines` | `complete-result` only |

**Scope reduction:** Narrow `paths`, reduce recursive breadth, or constrain files with `includeGlobs`.

---

## Session Lifecycle

```
Caller sends base request
    ↓
Admission → INLINE                     → response, no session created
         → PREVIEW_FIRST               → preview chunk + resumeToken (status: active)
         → COMPLETION_BACKED_REQUIRED  → completion chunk or first result + resumeToken (status: active)
         → NARROWING_REQUIRED          → error, no session created

Caller sends resumeToken + resumeMode
    ↓ (session loaded from SQLite)
NEXT_CHUNK mode    → next bounded preview chunk, session updated
COMPLETE_RESULT mode → server-owned completion attempt:
                       - final complete result → session marked completed
                       - renewed completion session → session updated (more work remains)
                       - narrowing guidance → session still active

Session expiry → status: expired → new base request required
Session completion → status: completed → no further resume possible
```

**Session persistence:** `src/infrastructure/persistence/inspection-resume-session-sqlite-store.ts`

---

## One Session Handle, Two Intents — Not Two Tokens

The architecture intentionally uses one `resumeToken` identifying the server-owned session state plus one explicit `resumeMode` field selecting the delivery intent.

This is **not** two separate tokens for chunk vs. full result. A second primary public token would only be justified if a distinct materialized result resource were introduced as a separate artifact in a later architecture revision.

---

## Preview-Lane Design Rationale and Context Budget

The preview-first admission lane is a first-class LLM-agent optimization path, not a fallback or compromise. Its primary purpose is to enable autonomous agents to make early-exit decisions from bounded preview chunks before committing to full traversal.

### Why the Preview Cap Is Sized at 150,000 Characters

`DISCOVERY_RESPONSE_CAP_CHARS = 150,000` is calibrated at 25% of `GLOBAL_RESPONSE_HARD_CAP_CHARS = 600,000`. This leaves headroom for the response envelope, metadata, and parallel tool calls while remaining large enough for a meaningful early-exit decision on most real-world filesystem structures.

**Key architectural property:** Shrinking the preview cap reduces the agent's early-exit rate, forcing a higher proportion of calls to require a follow-up (`next-chunk` or `complete-result`). A preview cap that is too narrow trades initial response efficiency for higher total token consumption across the session. The current 150,000-character calibration is intentional and must not be reduced without evidence that the early-exit rate remains acceptable.

### When LLM Agents Can Terminate at Preview

Many autonomous agent workflows can terminate at the preview chunk alone:

- Presence checks — confirming that a file or subdirectory exists within the listed entries.
- Shallow enumeration — listing top-level entries for a narrow non-recursive root.
- Signal-sufficient scans — finding a target entry before the traversal frontier is reached.

When the preview chunk satisfies the agent's current information need, no resume request is needed. This is the primary efficiency mechanism of the preview-first lane.

---

## `complete-result` Is Additive, Not Redundant

When a caller resumes a preview-first session with `resumeMode = 'complete-result'`, the server continues traversal from the **persisted frontier position** and returns only the entries that were not already delivered in the prior preview chunk.

This is the architecturally correct and token-efficient behavior:

- The preview chunk contains entries from the beginning of the traversal up to the frontier.
- The `complete-result` response contains entries from the frontier to the end of the traversal.
- The caller must combine both payloads to form the complete dataset.

Restarting traversal from the root in `complete-result` mode is architecturally incorrect: it would re-deliver the preview entries, doubling the token cost for the already-seen portion of the result.

The `admission.guidanceText` field in the `complete-result` response **must** communicate this additive contract in a machine-readable statement so that autonomous LLM agents can correctly reconstruct the full dataset without re-requesting the preview chunk.

---

## `complete-result` Is Not a Cap Bypass

`resumeMode = 'complete-result'` means the caller explicitly prefers a server-owned completion attempt over incremental chunks. It does **not**:

- disable any guardrail
- bypass the global response fuse
- guarantee delivery in a single call

The server may return:
- the final complete result (if it fits within the global fuse)
- a renewed resumable session (if more work remains after the next bounded pass)
- narrowing guidance (if even the bounded pass cannot make safe progress)

---

## Frontier Commit Precision

Preview-family cursor state must be **commit-based**. A traversal frontier may advance only after an entry, match, or boundary has been:

1. committed into the current delivered chunk, OR
2. explicitly persisted as the next pending unit in the resume state.

Pre-advancing the frontier without a commit is forbidden. This ensures that resume replay never skips or duplicates entries.

**Source:** [`src/domain/shared/resume/inspection-resume-frontier.ts`](../../src/domain/shared/resume/inspection-resume-frontier.ts)
