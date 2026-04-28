# Content Inspection Operation Capability Matrix

> **Context:** See [`CONVENTIONS.md`](../../CONVENTIONS.md) for the full conventions index and core invariants.
> **Overview:** See [`overview.md`](./overview.md) for the shared classification architecture and sampling model.
> **Related:** See [`guardrails/overview.md`](../guardrails/overview.md) for the guardrail layers that consume inspection outcomes.

---

## Purpose

This document defines the **single source of truth** for how file-content inspection states translate into caller-visible operation capabilities.

The project distinguishes between two families:

1. **Content-inspecting endpoints** — endpoints that read or inspect file bytes and therefore require a text/binary/hybrid decision before execution.
2. **Path-discovery endpoints** — endpoints that enumerate or match paths only and therefore do **not** require file-content inspection.

The architectural rule is strict:

- **Content-state classification is shared and centralized.**
- **Sampling strategy is shared and centralized.**
- **Operation permission is derived from one shared capability matrix instead of endpoint-local ad hoc branching.**

---

## Endpoint Family Split

### Content-Inspecting Endpoints

The following endpoint families inspect file content and therefore participate in the shared content-inspection architecture:

| Endpoint | Current code surface |
|---|---|
| `read_file_content` | [`src/domain/inspection/read-file-content/handler.ts`](../../src/domain/inspection/read-file-content/handler.ts) |
| `read_files_with_line_numbers` | [`src/domain/inspection/read-files-with-line-numbers/handler.ts`](../../src/domain/inspection/read-files-with-line-numbers/handler.ts) |
| `search_file_contents_by_regex` | [`src/domain/inspection/search-file-contents-by-regex/handler.ts`](../../src/domain/inspection/search-file-contents-by-regex/handler.ts) |
| `search_file_contents_by_fixed_string` | [`src/domain/inspection/search-file-contents-by-fixed-string/fixed-string-search-support.ts`](../../src/domain/inspection/search-file-contents-by-fixed-string/fixed-string-search-support.ts) |
| `count_lines` | [`src/domain/inspection/count-lines/handler.ts`](../../src/domain/inspection/count-lines/handler.ts) |

### Path-Discovery Endpoints

The following endpoint families do **not** inspect file content and therefore do not participate in binary/hybrid classification:

| Endpoint | Current code surface | Why excluded |
|---|---|---|
| `find_files_by_glob` | [`src/domain/inspection/find-files-by-glob/handler.ts`](../../src/domain/inspection/find-files-by-glob/handler.ts) | Matches path names only |
| name-discovery and directory-listing families | discovery surfaces in `src/domain/inspection/*` | Enumerate paths or metadata only |

Path-discovery endpoints still depend on traversal and response guardrails, but they do not consume content-state capability decisions.

---

## SSOT Architecture Boundaries

The content-inspection architecture is split into three explicit layers:

### 1. Shared Sampling Layer

The sampling layer owns **how raw bytes are collected** for classification.

Its invariants are:

- small surfaces may be fully sampled
- large surfaces must use bounded **head / middle / tail** windows
- all content-inspecting endpoints use the same sampling topology for the same file-size class
- endpoint-local single-window shortcuts are forbidden for content-state classification

### 2. Shared Content-State Classifier

The classifier owns **what the sampled bytes mean**.

Its invariants are:

- extension hints are signals, not the final authority
- text encoding must be considered before binary veto decisions are made
- binary evidence is weighted, not reduced to one unconditional NUL-byte hard stop
- hybrid states are first-class architectural states, not endpoint-local exceptions

### 3. Shared Operation Capability Policy

The capability policy owns **which operations are allowed** for a resolved content state.

Its invariants are:

- all content-inspecting endpoints derive permission from one shared capability matrix
- endpoint-local branching on `TEXT_CONFIDENT`, `HYBRID_*`, or `BINARY_CONFIDENT` outside the shared policy is forbidden
- operation-specific differences are allowed only at the capability-policy layer, not at the classification layer

---

## Shared Sampling Contract

The bounded sampling architecture exists because large files must be classified without forcing an eager full read.

### Small Surface Rule

When a file remains below the shared large-surface threshold, the classifier may use one complete small-surface sample.

### Large Surface Rule

When a file reaches the large-surface threshold, the classifier must inspect:

- `head`
- `middle`
- `tail`

using the shared window constants from [`tool-guardrail-limits.ts`](../../src/domain/shared/guardrails/tool-guardrail-limits.ts).

### Architectural Invariant

The head/middle/tail model is not specific to direct reads. It is the shared inspection geometry for all content-inspecting endpoints whenever the file is large enough to require bounded evidence.

Any endpoint that uses only a head sample for large-surface content-state decisions is architecturally non-compliant.

---

## Shared Content-State Taxonomy

The target taxonomy for the content-inspection architecture is:

| State | Meaning |
|---|---|
| `TEXT_CONFIDENT` | The sampled surface is confidently text and the decoded content remains strongly text-compatible. |
| `HYBRID_TEXT_DOMINANT` | The sampled surface contains mixed signals, but the text-compatible share remains dominant enough for content-oriented agent work. |
| `HYBRID_BINARY_DOMINANT` | The sampled surface contains mixed signals, but binary evidence dominates strongly enough that text-oriented work would be misleading or low-value. |
| `BINARY_CONFIDENT` | The sampled surface is conclusively binary or non-text-compatible. |
| `UNKNOWN_LARGE_SURFACE` | The system cannot derive enough bounded evidence to classify the surface safely. |

### Architectural Notes

1. `HYBRID_TEXT_DOMINANT` and `HYBRID_BINARY_DOMINANT` are **content states**, not operation names.
2. `HYBRID_TEXT_DOMINANT` is not a fallback loophole; it is a real state for text-majority mixed surfaces.
3. `BINARY_CONFIDENT` is reserved for surfaces whose bytes or decoding behavior make text work semantically invalid.
4. `UNKNOWN_LARGE_SURFACE` remains a conservative refusal state when bounded evidence is insufficient.

---

## Encoding-Aware Classification Rule

The classifier must not treat raw NUL bytes as an unconditional proof of binary content.

Before a final binary verdict is reached, the shared classifier must evaluate whether the sampled bytes are consistent with a supported text encoding, especially when the byte pattern matches common UTF-16 text surfaces.

### Mandatory Rule

If sampled bytes are compatible with a supported text encoding and decode into a text-compatible surface, the classifier must not return `BINARY_CONFIDENT` solely because NUL bytes are present in the raw byte stream.

### Why this exists

Text files such as SQL dumps may be stored in UTF-16-oriented encodings. Those files can contain many raw NUL bytes while still being fully readable and semantically text-oriented for agent search or read operations.

Treating raw NUL-byte presence as an unconditional binary veto would therefore reject valid text work and break the architecture's core purpose.

---

## Shared Operation Capability Matrix

The following matrix is the architectural permission model for content-inspecting endpoints.

| Content state | Full read | Fixed-string search | Regex search | Count lines |
|---|---|---|---|---|
| `TEXT_CONFIDENT` | ✅ allowed | ✅ allowed | ✅ allowed | ✅ allowed |
| `HYBRID_TEXT_DOMINANT` | ✅ allowed | ✅ allowed | ✅ allowed | ✅ allowed |
| `HYBRID_BINARY_DOMINANT` | ❌ reject | ❌ reject | ❌ reject | ❌ reject |
| `BINARY_CONFIDENT` | ❌ reject | ❌ reject | ❌ reject | ❌ reject |
| `UNKNOWN_LARGE_SURFACE` | ❌ reject | ❌ reject | ❌ reject | ❌ reject |

### Interpretation

- If the system decides that a surface is text-dominant, then both **read** and **search** operations must remain available.
- A direct-read endpoint must not be stricter than a search endpoint on the same `HYBRID_TEXT_DOMINANT` surface.
- A search endpoint must not use a weaker classifier than a direct-read endpoint for the same file class.
- If a content state is rejected, all content-inspecting operations reject it consistently.

---

## Why Homogeneous Capability Matters for Agent Systems

An LLM agent does not reason in isolated endpoint silos. It reasons over one file surface and may need to:

1. inspect whether a file is usable
2. search inside it
3. read the relevant sections or the whole content
4. continue analysis based on that same file surface

If read endpoints and search endpoints apply different eligibility models to the same file, the orchestration layer receives contradictory truths about one artifact. That increases failure branching, retry churn, and prompt-level ambiguity.

Therefore, the architecture requires:

- one shared content-state truth
- one shared sampling truth
- one shared permission truth

Operational differences such as response caps, resume modes, and formatting are still endpoint-specific, but the content-eligibility decision is not.

---

## Endpoint Compliance Requirements

Every content-inspecting endpoint must satisfy the following:

1. It must obtain bounded evidence through the shared sampling contract.
2. It must classify the file through the shared content-state classifier.
3. It must derive permission through the shared capability policy.
4. It must not maintain its own endpoint-local fallback taxonomy.
5. It must not silently reinterpret `HYBRID_*` states into ad hoc local booleans.

---

## Non-Compliant Patterns

The following patterns are architecturally forbidden:

1. **Single-window-only classification for large files** on one endpoint while other endpoints use head/middle/tail.
2. **Unconditional NUL-byte rejection** before encoding-aware text detection runs.
3. **Endpoint-local text eligibility booleans** that drift away from the shared content-state capability matrix.
4. **Different allowed-state sets per content-inspecting endpoint** unless those differences are expressed in the shared capability matrix itself.
5. **Discovery endpoints consuming content-state classification** even though they never inspect file content.

---

## Implementation Invariants

1. The sampling contract must remain reusable for future content-inspecting endpoints.
2. The shared classifier must remain pure and filesystem-agnostic.
3. The operation capability policy must remain separate from sampling and classification logic.
4. TSDoc in code should use `@link` references to this conventions surface instead of re-declaring governance rules inline.

---

## Summary

The architecture is correct only when:

- large files are classified through shared bounded multi-window evidence
- encoding-aware text detection runs before binary veto conclusions
- hybrid text-dominant surfaces are first-class states
- direct reads and search endpoints use the same eligibility model
- discovery endpoints remain outside the content-inspection family

This document is the normative capability contract for that model.
