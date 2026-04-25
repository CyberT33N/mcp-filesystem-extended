# Content Classification Architecture Overview

> **Context:** See [`CONVENTIONS.md`](../../CONVENTIONS.md) for the full conventions index and core invariants.  
> **Related:** [`conventions/content-classification/schema-optionality-contract.md`](./schema-optionality-contract.md) for the schema-level optionality rule that prevents sentinel-default bugs.  
> **Related:** [`conventions/guardrails/overview.md`](../guardrails/overview.md) for guardrail layers that consume classifier output.

---

## Purpose

The content-classification subsystem determines whether a candidate file surface is safe for text-oriented operations before any search, pattern-matching, or line-counting execution begins. This classification is a **proactive filter** — it prevents semantically incorrect results (e.g., binary noise counted as lines, regex applied to binary content) rather than failing at execution time.

---

## Classification States

The shared taxonomy lives in [`src/domain/shared/search/inspection-content-state.ts`](../../src/domain/shared/search/inspection-content-state.ts).

| State | Meaning | Consumer behavior |
|---|---|---|
| `TEXT_CONFIDENT` | File is conclusively text. Extension hint plus content probe agree. | All text-oriented execution lanes are permitted. |
| `HYBRID_SEARCHABLE` | File passes text-compatibility checks but classification confidence is not HIGH. | Total-only counting is rejected (results would be semantically misleading). Pattern-aware operations are rejected. Text-eligibility bridge still flags this as eligible via `classifyTextBinarySurface`. |
| `BINARY_CONFIDENT` | File has a hard binary extension or failed content probe (NUL byte, UTF-8 errors, control-byte density). | All text-oriented execution is rejected. |
| `UNKNOWN_LARGE_SURFACE` | File is large and no content sample is available, or no extension hint is present and no sample is provided. | Rejected conservatively. |

---

## Classification Decision Tree

```
Input: candidatePath + optional candidateFileBytes + optional contentSample
    │
    ├── Extension in HARD_BINARY_EXTENSION_HINTS?
    │   → BINARY_CONFIDENT (HIGH confidence)
    │
    ├── No contentSample provided?
    │   ├── Large surface (>= threshold)?
    │   │   → UNKNOWN_LARGE_SURFACE (LOW confidence)
    │   ├── Extension in TEXT_EXTENSION_HINTS?
    │   │   → HYBRID_SEARCHABLE (LOW confidence)
    │   │   (text hint present but no content probe — not enough for TEXT_CONFIDENT)
    │   └── Neither large nor text extension?
    │       → UNKNOWN_LARGE_SURFACE (LOW confidence)
    │
    └── contentSample provided → run content probe:
        ├── NUL byte present?
        │   → BINARY_CONFIDENT (HIGH confidence)
        ├── UTF-8 replacement ratio > 5%?
        │   → BINARY_CONFIDENT (HIGH confidence)
        ├── Control-byte ratio > 10%?
        │   → BINARY_CONFIDENT (HIGH confidence)
        └── Probe passes (text-compatible):
            ├── Text extension + (small surface OR full window coverage)?
            │   → TEXT_CONFIDENT (HIGH confidence)
            ├── Large surface without full window coverage?
            │   → HYBRID_SEARCHABLE (MEDIUM confidence)
            └── No text extension, probe passed?
                → HYBRID_SEARCHABLE (MEDIUM confidence)
```

---

## Sampling Strategy

The classifier uses bounded multi-window sampling to avoid loading full file contents. Window positions are defined in `INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_POSITIONS` (from `tool-guardrail-limits.ts`). Each window samples `INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_BYTES` bytes.

**Full sampling coverage** — all configured window positions sampled — is required to upgrade a large surface from `HYBRID_SEARCHABLE` to `TEXT_CONFIDENT`. A single beginning-of-file sample is insufficient for large files because binary content can appear after a valid UTF-8 header.

**Callers supply the sample:** The classifier itself does not perform I/O. Callers read the sample and pass it as `contentSample: Uint8Array`. This keeps the domain classifier pure and testable without filesystem access.

### Large Surface Threshold

A file is a **large surface** when its byte size is `>= INSPECTION_CONTENT_STATE_UNKNOWN_LARGE_SURFACE_MIN_BYTES`. This constant equals `INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_BYTES * number_of_windows + 1`, which is currently `4096 * 3 + 1 = 12,289 bytes`.

Files below this threshold can be fully characterized by a single head-window sample. Files at or above this threshold require head, middle, and tail windows to achieve `TEXT_CONFIDENT` classification.

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

// Multi-window sampling: reads head, middle, and tail for large surfaces.
// For small surfaces, only the head window is read.
async function readMultiWindowInspectionContentSample(
  filePath: string,
  fileBytes: number,
): Promise<{ sample: Uint8Array; sampledWindowPositions: readonly InspectionContentSampleWindowPosition[] } | null> {
  // ... open file handle, read windows based on isLargeSurface condition,
  // return combined buffer + sampled positions
}

// Usage in handler:
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

**What breaks when only head-window is used:** A `.md` file with a text extension but size >= 12,289 bytes receives only `HYBRID_SEARCHABLE` (MEDIUM confidence) instead of `TEXT_CONFIDENT` (HIGH confidence). This causes `resolveCountQueryPolicy()` to return `UNSUPPORTED_STATE` for both total-only and pattern-aware counting, failing the request — even though the file is valid UTF-8 text throughout.

**The `sampledWindowPositions` field is not optional for large files.** Omitting it while providing only a head-window sample causes the classifier to assume single-window coverage and produce the same conservative `HYBRID_SEARCHABLE` result.

---

## Why `HYBRID_SEARCHABLE` Rejects Total-Only and Pattern-Aware Counting

`count_lines` must refuse `HYBRID_SEARCHABLE` surfaces for both execution lanes:

- **Total-only counting (`STREAMING_TOTAL_ONLY`):** The streaming line counter counts newline characters. On a hybrid or partially binary surface, the newline count would be returned as a line total, which is semantically misleading — the caller cannot distinguish file lines from binary data fragmented by newline-adjacent bytes.

- **Pattern-aware counting (`NATIVE_PATTERN_AWARE`):** Regex over non-text bytes produces undefined matching semantics. The native search backend cannot guarantee correct Unicode-aware matching on surfaces that failed the text-confidence test.

The rejection is implemented in [`resolveCountQueryPolicy()`](../../src/domain/shared/search/count-query-policy.ts) via the `UNSUPPORTED_STATE` execution lane. The policy checks `inspectionContentState !== TEXT_CONFIDENT` for both the `undefined`-pattern and pattern-present branches.

---

## Text-Binary Compatibility Bridge

[`classifyTextBinarySurface()`](../../src/domain/shared/search/text-binary-classifier.ts) wraps the core classifier and adds an `isTextEligible` boolean. It treats both `TEXT_CONFIDENT` and `HYBRID_SEARCHABLE` as eligible for text-oriented search (but not for `count_lines` total or pattern execution).

This bridge exists for search endpoints (`search_file_contents_by_regex`, `search_file_contents_by_fixed_string`) that use a more permissive eligibility check than `count_lines`. The underlying classification state is still preserved and surfaced to the caller for transparency.

---

## Endpoint-Level Classifier Integration

| Endpoint | Classifier entry point | Rejection behavior |
|---|---|---|
| `count_lines` | `classifyInspectionContentState()` → `resolveCountQueryPolicy()` | `UNSUPPORTED_STATE` lane — throws error with reroute guidance |
| `search_file_contents_by_regex` | `classifyTextBinarySurface()` | Skips file when `isTextEligible = false` |
| `search_file_contents_by_fixed_string` | `classifyTextBinarySurface()` | Skips file when `isTextEligible = false` |

---

## Extension Hint Sets

The classifier maintains two static sets:

- **`TEXT_EXTENSION_HINTS`** — Known text-producing extensions (`.ts`, `.js`, `.md`, `.json`, `.py`, `.go`, etc.). Presence upgrades an unprobed surface to `HYBRID_SEARCHABLE` instead of `UNKNOWN_LARGE_SURFACE`. Together with a passing content probe, it enables `TEXT_CONFIDENT`.

- **`HARD_BINARY_EXTENSION_HINTS`** — Known binary or container extensions (`.png`, `.jpg`, `.pdf`, `.zip`, `.wasm`, `.dll`, etc.). Presence immediately returns `BINARY_CONFIDENT` without content sampling — no sample is read.

Extension matching is case-insensitive and operates on the file extension extracted by `path.extname()`.

---

## Invariants

1. **The classifier never performs I/O.** It receives an optional pre-read sample. Callers are responsible for reading and passing the sample.

2. **`BINARY_CONFIDENT` from a hard extension overrides all other signals.** No content probe is run for hard-binary extensions.

3. **`TEXT_CONFIDENT` requires both a passing content probe and a text extension hint** (plus adequate sampling coverage for large surfaces). Extension hint alone is never sufficient for `TEXT_CONFIDENT`.

4. **`HYBRID_SEARCHABLE` is a conservative intermediate state, not a safe text-execution state for all consumers.** `count_lines` rejects it. Search endpoints accept it for file scanning but not for guaranteed line-semantic operations.

5. **Absence of a content sample on a small surface with a text extension produces `HYBRID_SEARCHABLE`, not `TEXT_CONFIDENT`.** Callers that skip the sample read accept a conservative downgrade.
