# Resume Architecture Workflow

> **Context:** See [`CONVENTIONS.md`](../../CONVENTIONS.md) for the full conventions index and core invariants.  
> **Overview:** [`conventions/resume-architecture/overview.md`](./overview.md) for endpoint families, session lifecycle, and contract surfaces.  
> **Guardrail interaction:** [`conventions/resume-architecture/guardrail-interaction.md`](./guardrail-interaction.md) for mode-aware cap rules.

---

## Step-by-Step Execution Flows

### Flow A: Base Request — Inline Delivery

Applies when the admitted workload fits within the inline execution band.

```
1. Caller sends base request (no resumeToken)
2. Schema caps validated (Layer 1)
3. Preflight + admission decision → outcome: INLINE
4. Full traversal/search/count executed synchronously
5. Family-level response cap checked against output size
6. Global fuse checked against output size
7. Response returned with:
   - admission.outcome = 'inline'
   - resume.resumable = false
   - resume.resumeToken = null
   (no session created in SQLite)
```

**Guardrails active:** Schema (1), Admission (2), Probe (3), Family Cap (5), Global Fuse (6)

---

### Flow B: Base Request — Preview-First Delivery

Applies when the workload exceeds the inline band but is within the preview-first band.

```
1. Caller sends base request (no resumeToken)
2. Schema caps validated
3. Preflight + admission decision → outcome: PREVIEW_FIRST
4. Preview-lane traversal begins with bounded runtime limits
5. Bounded chunk collected (stops at preview text cap or runtime budget)
6. Resume session created in SQLite with:
   - requestPayload (original normalized request)
   - resumeState (traversal frontier position)
   - admissionOutcome = 'preview-first'
   - lastRequestedResumeMode = null
7. Response returned with:
   - admission.outcome = 'preview-first'
   - resume.resumable = true
   - resume.resumeToken = <opaque session handle>
   - resume.supportedResumeModes = ['next-chunk', 'complete-result']
   - resume.recommendedResumeMode = 'next-chunk'
   - Bounded chunk payload in structuredContent
   - Compact summary + guidance in content.text
```

**Guardrails active:** Schema (1), Admission (2), Probe (3), Preview Runtime Budget (4), Family Cap (5) on text output, Global Fuse (6)

---

### Flow C: Resume Request — `next-chunk` Mode

Applies when the caller sends `resumeToken + resumeMode='next-chunk'`.

```
1. Caller sends: { resumeToken: "...", resumeMode: "next-chunk" }
   (no base request fields)
2. Schema caps validated (resume-only request shape)
3. Session loaded from SQLite → requestPayload + resumeState restored
4. Preflight + admission decision re-evaluated against requestPayload
   (result is still PREVIEW_FIRST — same workload)
5. Preview-lane traversal resumes from the persisted frontier position
6. Next bounded chunk collected
7. Session updated in SQLite with new frontier position
8. Response returned with:
   - admission.outcome = 'preview-first'
   - resume.resumable = true (unless traversal is complete)
   - resume.resumeToken = same token
   - resume.supportedResumeModes = ['next-chunk', 'complete-result']
   - Next chunk payload in structuredContent
```

**Guardrails active:** Schema (1), Admission (2) re-evaluated, Preview Runtime Budget (4), Family Cap (5) on text output, Global Fuse (6)

---

### Flow D: Resume Request — `complete-result` Mode (Preview Family)

Applies when the caller sends `resumeToken + resumeMode='complete-result'` for a preview-capable family.

```
1. Caller sends: { resumeToken: "...", resumeMode: "complete-result" }
   (no base request fields)
2. Schema caps validated (resume-only request shape)
3. Session loaded from SQLite → requestPayload + resumeState restored
4. Preflight + admission decision re-evaluated against requestPayload
   (result is still PREVIEW_FIRST — same workload)
5. Because resumeMode = 'complete-result':
   handler bypasses the preview-lane chunk branch
   and enters the FULL TRAVERSAL path instead
6. Full traversal executed (no preview boundary cuts)
   Runtime emergency safeguard active (500K entries, 50K dirs, 5s)
7. Output formatted
8. ⚠️ Family-level cap MUST NOT fire here — only the global fuse applies
9. Global fuse checked (600,000 chars)
10. Session marked completed in SQLite
11. Response returned with:
    - admission.outcome = 'completion-backed-required'
    - resume.resumable = false (if complete)
    - Complete result payload in structuredContent
    - Complete result in content.text (if within global fuse)
```

**Guardrails active:** Schema (1), Admission (2) re-evaluated, Deep Emergency Runtime Budget (within traversal), **Global Fuse (6) only — NOT family cap (5)**

> **Critical rule:** The family-level `assertActualTextBudget` call with `DISCOVERY_RESPONSE_CAP_CHARS` or `REGEX_SEARCH_RESPONSE_CAP_CHARS` must be conditional on the delivery mode. In `complete-result` mode, the effective cap must be `GLOBAL_RESPONSE_HARD_CAP_CHARS`. See [`guardrail-interaction.md`](./guardrail-interaction.md).

---

### Flow E: Resume Request — `complete-result` Mode (`count_lines`)

Applies when the caller sends `resumeToken + resumeMode='complete-result'` for `count_lines`.

```
1. Caller sends: { resumeToken: "...", resumeMode: "complete-result" }
2. Schema caps validated (count_lines only accepts 'complete-result')
3. Session loaded from SQLite → requestPayload + continuationState restored
4. Admission re-evaluated → outcome: COMPLETION_BACKED_REQUIRED
5. Task-backed execution continues from the persisted traversal state
   (countLinesInDirectoryTaskBacked with runtimeBudgetLimits from execution policy)
6. If more files remain → chunk exhausted, session updated, response with:
   - paths = [] (partial, not yet complete)
   - admission.outcome = 'completion-backed-required'
   - resume.resumable = true → caller must send another complete-result request
7. If all files counted → response with full aggregated results
   - paths = [...all path results]
   - admission.outcome = 'completion-backed-required'
   - resume.resumable = false
   - Session marked completed
```

**Guardrails active:** Schema (1), Admission (2), Preview-lane runtime limits as chunk boundaries in task-backed execution, Family Cap (5) on final formatted output only (inline-complete totals), Global Fuse (6)

---

### Flow F: Workload Exceeds All Bands — `narrowing-required`

Applies when the workload exceeds all available execution bands and the consumer has no task-backed or preview-first capability.

```
1. Admission decision → outcome: NARROWING_REQUIRED
2. Handler throws guidance error (no session created)
3. Response:
   - isError = true
   - content.text = scope-reduction guidance
   - No resumeToken
```

**Caller action required:** Reduce scope by narrowing roots, deepening paths, or adding include/exclude filters.

---

## Caller Decision Tree

```
Received response:
    ├── admission.outcome = 'inline'
    │   → Done. Use the result directly.
    │
    ├── admission.outcome = 'preview-first'
    │   resume.resumable = true
    │   ├── Already have what I need from the preview chunk?
    │   │   → Done. No resume needed.
    │   │
    │   ├── Need the complete dataset?
    │   │   → Send: { resumeToken, resumeMode: 'complete-result' }
    │   │   (server will attempt full completion)
    │   │
    │   ├── Want to inspect incrementally?
    │   │   → Send: { resumeToken, resumeMode: 'next-chunk' }
    │   │   (repeat until resume.resumable = false)
    │   │
    │   └── Prefer to avoid resuming?
    │       → Reduce scope and send a new base request
    │
    ├── admission.outcome = 'completion-backed-required'
    │   resume.resumable = true
    │   → Send: { resumeToken, resumeMode: 'complete-result' }
    │   (repeat until resume.resumable = false or paths complete)
    │
    ├── admission.outcome = 'completion-backed-required'
    │   resume.resumable = false, paths = []
    │   → Session expired or workload could not complete
    │   → Reduce scope and retry
    │
    └── admission.outcome = 'narrowing-required'
        → Reduce scope and send a new base request
```
