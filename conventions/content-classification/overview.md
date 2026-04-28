# Content Classification Architecture Overview

> **Context:** See [`CONVENTIONS.md`](../../CONVENTIONS.md) for the full conventions index and core invariants.  
> **Related:** [`conventions/content-classification/schema-optionality-contract.md`](./schema-optionality-contract.md) for the schema-level optionality rule that prevents sentinel-default bugs.  
> **Related:** [`conventions/guardrails/overview.md`](../guardrails/overview.md) for guardrail layers that consume classifier output.

---

## Purpose

The content-classification subsystem determines whether a candidate file surface is safe for text-oriented operations before any search, pattern-matching, or line-counting execution begins. This classification is a **proactive filter** — it prevents semantically incorrect results (e.g., binary noise counted as lines, regex applied to binary content) rather than failing at execution time.

---

## Purpose of the Shared Classifier

The shared classifier exists to answer one question before content-oriented execution begins:

> Is this file surface text-compatible enough for the requested content-inspecting operation?

The classifier is **not** the same thing as the endpoint policy. It produces a shared content-state surface. A separate shared capability layer decides which operations are allowed for which states. See [`operation-capability-matrix.md`](./operation-capability-matrix.md).

---

## Classification States

The shared taxonomy belongs in the domain layer and is represented by the shared classifier surfaces in [`inspection-content-state.ts`](../../src/domain/shared/search/inspection-content-state.ts) and its follow-up policy surfaces.

The target architecture uses the following states:

| State | Meaning |
|---|---|
| `TEXT_CONFIDENT` | The sampled surface is confidently text and remains strongly decode-compatible. |
| `HYBRID_TEXT_DOMINANT` | The sampled surface contains mixed evidence, but text remains dominant enough for content-oriented agent work. |
| `HYBRID_BINARY_DOMINANT` | The sampled surface contains mixed evidence, but binary signals dominate strongly enough that text-oriented work would be misleading. |
| `BINARY_CONFIDENT` | The sampled surface is conclusively binary or non-text-compatible. |
| `UNKNOWN_LARGE_SURFACE` | The system lacks enough bounded evidence to classify the surface safely. |

---

## Classification Decision Tree

```
Input: candidatePath + optional candidateFileBytes + optional contentSample
    │
    ├── Extension in HARD_BINARY_EXTENSION_HINTS?
    │   → BINARY_CONFIDENT
    │
    ├── No contentSample provided?
    │   ├── Large surface (>= threshold)?
    │   │   → UNKNOWN_LARGE_SURFACE
    │   ├── Extension in TEXT_EXTENSION_HINTS?
    │   │   → unknown text-leaning state until bounded evidence exists
    │   └── Neither large nor text extension?
    │       → UNKNOWN_LARGE_SURFACE
    │
    └── contentSample provided → run shared content probe:
        ├── Supported text encoding detected and decode stays text-compatible?
        │   → continue weighted evaluation
        ├── Mixed text/binary evidence present?
        │   ├── Text evidence dominates?
        │   │   → HYBRID_TEXT_DOMINANT
        │   └── Binary evidence dominates?
        │       → HYBRID_BINARY_DOMINANT
        ├── Text extension + passing evidence + adequate sampling coverage?
        │   → TEXT_CONFIDENT
        ├── Evidence is conclusively non-text-compatible?
        │   → BINARY_CONFIDENT
        └── Evidence still insufficient?
            → UNKNOWN_LARGE_SURFACE
```

### Architectural Note

This decision tree is intentionally **encoding-aware** and **weighted**. A raw NUL-byte observation must not act as an unconditional binary veto before text-encoding compatibility has been evaluated.

---

## Sampling Strategy

The classifier uses bounded multi-window sampling to avoid eager full reads while still observing enough of the file surface to make a stable content-state decision.

Window positions are defined in `INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_POSITIONS` (from `tool-guardrail-limits.ts`). Each window samples `INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_BYTES` bytes.

### Small Surface Rule

If the file stays below the shared large-surface threshold, a full small-surface sample may be used.

### Large Surface Rule

If the file reaches the large-surface threshold, the shared sampling contract must inspect:

- `head`
- `middle`
- `tail`

for every content-inspecting endpoint.

**A single beginning-of-file sample is insufficient for large files.** Binary regions or alternate encoding behavior may appear outside the initial window.

**Callers supply the sample:** The classifier itself does not perform I/O. Callers read the sample and pass it as `contentSample: Uint8Array`. This keeps the domain classifier pure and testable without filesystem access.

### Large Surface Threshold

A file is a **large surface** when its byte size is `>= INSPECTION_CONTENT_STATE_UNKNOWN_LARGE_SURFACE_MIN_BYTES`. This constant equals `INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_BYTES * number_of_windows + 1`, which is currently `4096 * 3 + 1 = 12,289 bytes`.

Files below this threshold may be fully characterized by one complete small-surface sample. Files at or above this threshold require head, middle, and tail windows for any high-confidence text-compatible classification.

### Handler Sampling Contract (Mandatory)

Every handler that calls `classifyInspectionContentState()` **MUST** implement multi-window sampling for files that meet the large-surface threshold. A single head-window read is insufficient for large files.

**Required implementation pattern:**

```ts
import {
  INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_BYTES,
  INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_POSITIONS,
  INSPECTION_CONTENT_STATE_UNKNOWN_LARGE_SURFACE_MIN_BYTES,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import {
  classifyInspectionContentState,
  type InspectionContentSampleWindowPosition,
  type InspectionContentStateInput,
} from "@domain/shared/search/inspection-content-state";

async function readMultiWindowInspectionContentSample(
  filePath: string,
  fileBytes: number,
): Promise<{
  sample: Uint8Array;
  sampledWindowPositions: readonly InspectionContentSampleWindowPosition[];
} | null> {
  // Read bounded head, middle, and tail windows for large surfaces.
}

const multiWindowSample = await readMultiWindowInspectionContentSample(filePath, fileStats.size);
const classifierInput: InspectionContentStateInput = multiWindowSample === null
  ? { candidatePath: filePath, candidateFileBytes: fileStats.size }
  : {
      candidatePath: filePath,
      candidateFileBytes: fileStats.size,
      contentSample: multiWindowSample.sample,
      sampledWindowPositions: multiWindowSample.sampledWindowPositions,
    };
const inspectionContentState = classifyInspectionContentState(classifierInput);
```

**What breaks when only head-window is used:** the endpoint stops sharing the same file-truth as the rest of the content-inspection family. Large text files may be downgraded conservatively or large mixed files may be misclassified because only the first window was observed.

**The `sampledWindowPositions` field is not optional for large files.** Omitting it while providing only a head-window sample breaks the shared large-surface contract and forces the classifier into an unjustifiably weak evidence posture.

---

## Encoding-Aware Classification Rule

The classifier must not treat raw NUL bytes as unconditional binary proof.

### Mandatory Rule

If a sampled byte surface is compatible with a supported text encoding and decodes into a text-compatible surface, the classifier must not conclude `BINARY_CONFIDENT` solely because raw NUL bytes are present.

### Why this matters

Text files such as SQL dumps may be stored in UTF-16-oriented encodings. Those files can contain many raw NUL bytes while still being fully readable and semantically useful for both agent reads and agent searches.

---

## Endpoint Family Split

### Content-Inspecting Endpoints

These endpoint families must all consume the same shared classification and capability architecture:

| Endpoint | Current code surface |
|---|---|
| `read_file_content` | [`src/domain/inspection/read-file-content/handler.ts`](../../src/domain/inspection/read-file-content/handler.ts) |
| `read_files_with_line_numbers` | [`src/domain/inspection/read-files-with-line-numbers/handler.ts`](../../src/domain/inspection/read-files-with-line-numbers/handler.ts) |
| `search_file_contents_by_regex` | [`src/domain/inspection/search-file-contents-by-regex/handler.ts`](../../src/domain/inspection/search-file-contents-by-regex/handler.ts) |
| `search_file_contents_by_fixed_string` | [`src/domain/inspection/search-file-contents-by-fixed-string/fixed-string-search-support.ts`](../../src/domain/inspection/search-file-contents-by-fixed-string/fixed-string-search-support.ts) |
| `count_lines` | [`src/domain/inspection/count-lines/handler.ts`](../../src/domain/inspection/count-lines/handler.ts) |

### Path-Discovery Endpoints

These endpoint families do not inspect file content and therefore stay outside the content-classification family:

| Endpoint | Current code surface |
|---|---|
| `find_files_by_glob` | [`src/domain/inspection/find-files-by-glob/handler.ts`](../../src/domain/inspection/find-files-by-glob/handler.ts) |

Path-discovery endpoints still consume traversal guardrails, but not text/binary/hybrid classification.

---

## Shared Capability Rule

The operation permission model is defined centrally in [`operation-capability-matrix.md`](./operation-capability-matrix.md).

The architectural invariant is:

- if a content state is text-dominant enough for search, it must also be modeled coherently for read eligibility
- endpoint-local drift in allowed-state semantics is forbidden
- read endpoints and search endpoints may differ in formatting, budgeting, or response shape, but not in the underlying file-truth model

---

## Extension Hint Sets

The classifier maintains static extension hints, but they are only one input into the final decision.

- **`TEXT_EXTENSION_HINTS`** — Known text-producing extensions. Presence is a positive signal but not final proof.
- **`HARD_BINARY_EXTENSION_HINTS`** — Known binary or container extensions. Presence is a strong early negative signal.

Extension matching is case-insensitive and operates on the file extension extracted by `path.extname()`.

---

## Invariants

1. **The classifier never performs I/O.** It receives an optional pre-read sample. Callers are responsible for reading and passing the sample.

2. **`BINARY_CONFIDENT` from a hard extension overrides all other signals.** No content probe is run for hard-binary extensions.

3. **Large-surface content-state decisions must use shared multi-window evidence.** Endpoint-local single-window shortcuts are forbidden for large files.

4. **Encoding-aware text detection runs before binary-veto conclusions are finalized.** Raw NUL-byte presence alone is insufficient.

5. **Capability decisions are shared, not endpoint-local.** All content-inspecting endpoints derive permission from the same capability contract.

6. **Path-discovery endpoints are outside the content-classification family.** They must not consume binary/hybrid gating because they do not inspect content bytes.
