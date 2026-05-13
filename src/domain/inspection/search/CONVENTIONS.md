# CONVENTIONS — Inspection Search Family

## Purpose of This Document

This document is the family-level single source of truth for the `inspection/search` subdomain.

It explains:
- why the search family exists as its own architectural layer under inspection,
- which endpoint families belong inside it,
- which rules are shared across the family,
- which rules remain endpoint-specific,
- why preview-first must remain available,
- and why preview-first must not trigger too eagerly for moderate recursive code-search workloads.

Shared cross-project rules remain owned by the workspace-level conventions index and the shared convention slices under [`conventions/`](../../../../conventions/).
This file does not replace those broader rules.
It specializes them for the inspection search family.

---

## Why a Dedicated `inspection/search` Family Exists

### Domain-driven placement

Under Domain-Driven Design, the inspection domain contains several distinct capabilities:
- discovery,
- metadata and integrity,
- read,
- count,
- and search.

Search is its own subdomain because it answers a different business question than:
- discovery (`which paths exist?`),
- read (`what is the file content?`),
- or count (`how many lines or matches exist?`).

The search family answers:

> Where do caller-requested content matches occur across validated file or directory scopes, and how should bounded continuation behave when one inline response is no longer the correct delivery shape?

That question is shared by both endpoint families in this subdomain:
- [`search_file_contents_by_regex`](./search-file-contents-by-regex/CONVENTIONS.md)
- [`search_file_contents_by_fixed_string`](./search-file-contents-by-fixed-string/CONVENTIONS.md)

### Why the folder is required

A dedicated `src/domain/inspection/search/` folder is architecturally correct because it gives the search family one explicit boundary for:
- family-level admission philosophy,
- family-level preview-first versus inline calibration,
- family-level continuation semantics,
- family-level response-shaping rationale,
- and family-level differentiation between regex and fixed-string search.

Without this layer, the project would be forced into one of two bad outcomes:
1. duplicate the same family-level reasoning in both endpoint folders, or
2. push search-family-specific rules up into workspace-level conventions where they would become too broad and blur the distinction between search, discovery, read, and count.

This family folder prevents both mistakes.

---

## Search Family Membership

### Included

The search family contains exactly these endpoint surfaces:
- [`search_file_contents_by_regex`](./search-file-contents-by-regex/CONVENTIONS.md)
- [`search_file_contents_by_fixed_string`](./search-file-contents-by-fixed-string/CONVENTIONS.md)

### Excluded

The following surfaces are intentionally not members of this family:
- discovery endpoints,
- read endpoints,
- metadata endpoints,
- [`count_lines`](../count-lines/CONVENTIONS.md)

`count_lines` remains adjacent, but separate.
It reuses some shared native-search infrastructure in pattern-aware flows, yet its business contract is counting, not localization.
It therefore must not inherit the search-family preview-calibration rules blindly.

---

## Documentation and SSOT Layering

The search family uses a three-level documentation hierarchy.

### Level 1 — Workspace-wide architecture

Owned by [`CONVENTIONS.md`](../../../../CONVENTIONS.md) and the shared convention leaves under [`conventions/`](../../../../conventions/).

This level owns:
- global guardrails,
- global resume architecture,
- shared structured-content contract,
- search-platform cross-family boundaries,
- and project-wide invariants.

### Level 2 — Search-family architecture

Owned by this family folder:
- [`CONVENTIONS.md`](./CONVENTIONS.md)
- [`DESCRIPTION.md`](./DESCRIPTION.md)
- [`README.md`](./README.md)

This level owns:
- search-family boundary placement,
- shared preview-first philosophy,
- shared too-eager-preview failure analysis,
- shared threshold-calibration rationale,
- and the decision to differentiate regex and fixed-string admission tuning.

### Level 3 — Endpoint-local specialization

Owned by each endpoint-local folder:
- [`search_file_contents_by_regex`](./search-file-contents-by-regex/CONVENTIONS.md)
- [`search_file_contents_by_fixed_string`](./search-file-contents-by-fixed-string/CONVENTIONS.md)

This level owns:
- endpoint-specific request semantics,
- endpoint-specific lane behavior,
- endpoint-specific reasoning for why regex and fixed-string do not receive identical tuning,
- and endpoint-specific examples and field-level detail.

### Architectural rule

The family layer must own what is truly shared across regex and fixed-string search.
The endpoint-local layer must own only what is genuinely endpoint-specific.
That is the required single-source-of-truth split.

---

## Family-Level Preview-First Philosophy

### What preview-first is for

Preview-first is a first-class architectural feature.
It exists so an LLM agent can:
- receive an early bounded result surface,
- decide whether the signal is already sufficient,
- and stop without paying the full continuation cost.

This is correct and must stay.

### What preview-first is not for

Preview-first is not an architectural goal by itself.
The system must not optimize for:
- preview-first triggering as often as possible,
- or preview-first triggering on every moderate recursive workload just because a second request is technically available.

The real optimization target is:

> Minimize total expected agent cost while preserving bounded caller-visible output.

That means the system must weigh:
- context flooding risk,
- against second-request overhead,
- reasoning churn,
- continuation-state handling,
- and error/drift risk across multiple calls.

### The too-eager-preview failure mode

The search family has one especially important anti-pattern:

> A preview-first threshold that triggers so early that most realistic search requests immediately require a second `complete-result` request.

When that happens, preview-first stops being a primary efficiency mechanism and becomes an architectural tax.

That tax is expensive in enterprise LLM-agent systems because it increases:
- total request count,
- orchestration complexity,
- state-carrying responsibility,
- follow-up failure branching,
- token consumption across multiple turns,
- and the probability of partial-result misuse.

This family therefore must not preserve overly conservative preview-first thresholds as a matter of inertia.

### Preview-slice payload rule

If the bounded preview lane has already reached caller-visible matches before the runtime checkpoint fires, those matches must be shown in the first preview response. Hiding them and only returning resume instructions would waste already paid traversal cost and increase prompt-roundtrip churn.

If the preview lane has not yet reached any caller-visible matches, the response must state that no matches were reached **yet in this preview slice**. It must not read like a final "no matches found" conclusion while resumable continuation still exists.

---

## Probability Model Used by This Family

The search family is intentionally calibrated around likely real-world agent behavior.

### Regex-search expectation

For recursive code-search workloads, regex search is more often used for:
- impact analysis,
- migration planning,
- consistency checks,
- architecture review,
- and pattern-based investigation.

Those workflows more often need the complete result set than only the first preview slice.

The family-level design assumption is therefore:
- preview-only sufficiency is the minority case,
- full-result follow-up is the majority case.

### Fixed-string-search expectation

Fixed-string search is more often used for:
- exact identifier usage scans,
- presence verification,
- literal value tracing,
- and exact known-token checks.

That gives fixed-string search a somewhat stronger preview-only case than regex.
However, even fixed-string search still frequently serves complete-result workflows in enterprise codebases.

### Architectural conclusion

Both endpoints must remain preview-capable.
But both must also be tuned so that moderate recursive code-search workloads do not fall into preview-first prematurely.

Regex remains the stricter endpoint.
Fixed-string remains slightly more inline-friendly than regex.

---

## Family-Level Threshold Strategy

### Shared invariant

Both endpoints retain:
- the same resume architecture,
- the same additive `complete-result` contract,
- the same global fuse,
- and the same response-shaping principle that keeps `content.text` complete.

### Differentiated admission tuning

The family now defines separate inline-admission tuning values for regex and fixed-string search.
The goal is:
- regex becomes less preview-eager than before,
- fixed-string also becomes less preview-eager than before,
- and fixed-string remains slightly more permissive than regex.

### Canonical family values

The family-owned threshold module is [`search-family-thresholds.ts`](./search-family-thresholds.ts).

| Value | Regex | Fixed string | Why |
|---|---:|---:|---|
| Preview execution soft runtime budget | `4,500 ms` | `4,500 ms` | Broad-root enterprise code search that is already narrowed by include globs should still deliver a meaningful bounded preview slice instead of tripping the older `3,000 ms` wall before the family can surface useful continuation state. |
| Inline execution budget override | `12,000 ms` | `14,000 ms` | Moderate recursive code-search workloads should stay inline more often when the projected result surface is still compact. Fixed-string gets a slightly larger inline budget because literal search is narrower and cheaper. |
| Estimated per-candidate-file cost | `90 ms` | `60 ms` | The previous values were too pessimistic for enterprise code-search workloads and caused premature preview-first routing. Fixed-string remains cheaper than regex because exact matching is operationally narrower. |

### Why these values differ

If the values were identical, the architecture would ignore a real semantic and operational difference between the two endpoint families.
That would be a domain-modeling mistake.

Regex has:
- broader pattern semantics,
- more exploratory usage,
- and a stronger risk of “I need the full impact set”.

Fixed-string has:
- narrower intent,
- lower execution complexity,
- and a somewhat higher chance that a preview slice is already enough.

The values therefore must differ.

The same family contract also draws one hard boundary: the `4,500 ms` calibration belongs to bounded preview execution only. Once the caller explicitly resumes with `resumeMode = 'complete-result'`, the preview-family completion branch must not inherit the legacy five-second local soft runtime timeout. The caller-visible completion ceiling is the global fuse.

---

## Family-Level Inline Target

The family-level target is not “never preview-first”.
The target is:

> Moderate recursive code-search workloads with roughly `~100` candidate files and a compact final result surface should remain inline more often than they did under the old tuning.

If such workloads almost always trigger preview-first, the family is still too conservative.

If broad high-density workloads inline too often and start flooding the caller context, the family has been relaxed too far.

The correct calibration sits between those two failure modes.

---

## Business-Code Ownership Rule

The family-level threshold philosophy must be realized in business code through:
- shared family-owned threshold constants,
- explicit consumer-level admission overrides where the shared traversal admission planner allows them,
- and endpoint-local registration paths that build `content.text` and `structuredContent` from one shared result execution.

That last rule matters because search-family continuation metadata must not diverge across duplicated executions.

If the family keeps duplicated execution paths, threshold tuning alone is not enough.
The family must also preserve one execution truth per request.

---

## Family-Level Non-Negotiable Rules

1. Search remains a distinct family under inspection.
2. Regex and fixed-string remain sibling endpoint families under that search boundary.
3. Workspace-wide conventions must not absorb search-family-specific threshold reasoning.
4. Endpoint-local conventions must not duplicate shared family rationale unnecessarily.
5. Preview-first remains available.
6. Preview-first must not trigger prematurely for moderate recursive code-search workloads.
7. Fixed-string must remain slightly more permissive than regex.
8. The family must prefer one shared execution result per request when producing `content.text` and `structuredContent`.

---

## Summary

The `inspection/search` family exists because search is a real subdomain inside inspection, not just two unrelated endpoint folders.

Its central architectural decision is:
- keep preview-first,
- keep same-endpoint resume,
- keep additive `complete-result`,
- but stop treating the old overly conservative preview trigger as the architectural end-state.

The family must now preserve:
- shared family-level rationale at this level,
- endpoint-local specialization below this level,
- and code-level threshold realization through family-owned constants and single-execution response construction.
