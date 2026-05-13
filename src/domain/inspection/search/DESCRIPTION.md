# DESCRIPTION — Inspection Search Family

## Purpose

The `inspection/search` family contains the content-localization endpoints under the inspection domain.

It exists to group the two endpoint families that answer the same business question at different match semantics:
- exact fixed-string matching,
- regex-driven pattern matching.

The family boundary exists because these endpoints share:
- text-oriented content-state eligibility,
- recursive traversal admission,
- preview-first and additive `complete-result` continuation,
- bounded match-localization output,
- and the same architectural failure mode when preview-first triggers too eagerly.

They do **not** share identical endpoint semantics.
So the family layer owns the shared architecture and each endpoint layer owns its specialization.

---

## Why this family is separate from the rest of inspection

The inspection domain contains multiple sub-capabilities:
- discovery,
- read,
- metadata and integrity,
- counting,
- and search.

Search is a distinct subdomain because it is not trying to:
- enumerate paths,
- stream file content,
- or compute totals as the primary business answer.

Instead, search answers:

> Where do caller-requested content matches occur across validated file and directory scopes, and how should the server continue when one inline response is no longer the correct delivery shape?

That shared question justifies a distinct family folder.

---

## Family members

The current search family contains exactly these endpoint folders:
- [`search_file_contents_by_regex`](./search-file-contents-by-regex/CONVENTIONS.md)
- [`search_file_contents_by_fixed_string`](./search-file-contents-by-fixed-string/CONVENTIONS.md)

They remain sibling families.
Neither endpoint replaces the other.

---

## Three-layer documentation ownership

### Workspace-wide ownership

The workspace conventions own:
- global guardrails,
- global resume architecture,
- structured-content contract,
- search-platform cross-family boundaries,
- and project-wide invariants.

### Search-family ownership

This folder owns:
- the reason search is its own inspection-family layer,
- preview-first calibration philosophy for search,
- the shared too-eager-preview problem statement,
- the reason both endpoints must be tuned upward from the older values,
- and the reason regex and fixed-string must still not use identical tuning.

### Endpoint-local ownership

Each endpoint folder owns:
- request-field semantics,
- runtime-lane specifics,
- endpoint-specific threshold values,
- endpoint-specific reasoning for why its tuning differs from its sibling.

This split is required by the single-source-of-truth model.

---

## Family architecture

### Shared invariants

Both endpoints share these non-negotiable rules:
- preview-first remains available,
- `complete-result` remains additive rather than redundant,
- `content.text` remains the complete primary result surface,
- `structuredContent` mirrors primary result data and owns machine-readable `admission` / `resume` envelope metadata,
- explicit file scopes must not be rejected solely because they are large,
- directory-root scopes must still enter recursive traversal admission,
- and the global fuse remains the non-bypassable final ceiling.

### Shared problem statement

The family is tuned around one central anti-pattern:

> If preview-first triggers so early that most realistic recursive code-search requests immediately require a second `complete-result` request, then preview-first is no longer acting as a primary efficiency mechanism. It is acting as a systematic extra-step tax.

That tax is expensive for enterprise LLM-agent systems because it increases:
- request count,
- reasoning churn,
- state-carrying burden,
- continuation error risk,
- and total token use across multiple turns.

So the family must preserve preview-first while preventing premature preview-first routing on moderate recursive code-search workloads.

---

## Probability model used by the family

### Regex

Regex search is more often used for:
- impact analysis,
- migration planning,
- consistency validation,
- architecture review,
- pattern-driven investigation.

Those workflows more often need the full result set.
So regex search must not remain tuned as aggressively preview-first as the earlier values implied.

### Fixed string

Fixed-string search is more often used for:
- exact identifier or literal scans,
- presence verification,
- exact-value tracing,
- and narrow known-token checks.

That gives it a somewhat stronger preview-only case than regex.
But even fixed-string search still frequently needs the complete result set in enterprise codebases.

## Architectural conclusion

Both endpoints must be relaxed upward from the older preview trigger posture.
Fixed-string remains slightly more permissive than regex.

---

## Execution-architecture correction

The family correction is not only about threshold values.
It also changes how valid inline directory-root workloads should execute once admission has already allowed them to stay inline.

The corrected target behavior is:
- directory-root scopes still enter shared traversal admission,
- per-file eligibility and decoded-text fallback decisions remain endpoint-owned,
- but validated native-searchable file candidates are now grouped into ordered shell-free native `ugrep` batches for the inline lane instead of forcing one native process spawn per file.
- when the preview-family completion branch owns the remaining work, native-eligible candidates may be materialized into one ordered execution plan and searched through one large or a few manifest-backed native `ugrep` batches,
- and decoded-text fallback files remain an ordered side-lane instead of fragmenting completion back into many tiny per-directory native flushes.

That batching correction matters because the older per-file execution shape could still burn runtime budget too quickly even after the admission layer had been tuned upward.
The family therefore treats threshold calibration, inline native-lane batching, and completion-plan batching as one coherent architecture correction.

Preview-first continuation remains the bounded fallback when the admitted inline lane is no longer the correct delivery shape.

---

## Family-owned threshold philosophy

The family-owned threshold module is [`search-family-thresholds.ts`](./search-family-thresholds.ts).

It defines the current search-family tuning direction:
- regex inline execution budget override,
- fixed-string inline execution budget override,
- regex per-candidate-file admission cost,
- fixed-string per-candidate-file admission cost.

These values are family-owned because they express search-family business intent rather than a project-wide invariant.

### Why these thresholds are not global

If these values were pushed into workspace-level conventions as global inspection limits, then:
- discovery would inherit search-specific tuning pressure,
- count would inherit localization-oriented assumptions,
- and read endpoints would be polluted with search-family continuation philosophy.

That would be incorrect.

### Why these thresholds are not duplicated in both endpoint folders only

If the values lived only inside both endpoint folders, then:
- the family-level problem statement would be duplicated,
- the shared too-eager-preview rationale would drift,
- and there would be no explicit middle architecture layer expressing why both endpoints are related but not identical.

That would also be incorrect.

---

## Search-family code ownership rules

The family business-code direction is:
- use shared family threshold constants,
- feed endpoint-specific admission overrides into the shared traversal admission planner,
- keep the global search-platform skeleton intact,
- and remove duplicated endpoint execution when building `content.text` and `structuredContent`.

That last point matters because once the endpoints are preview-capable and resumable, duplicated executions can create:
- divergent frontier advancement,
- divergent tokens,
- and text-versus-structured inconsistency.

So threshold retuning and single-execution response construction belong to the same correction wave.

---

## Expected end-state

The intended end-state is:
- the search family remains under `src/domain/inspection/search/`,
- preview-first still exists,
- the global fuse remains unchanged,
- regex becomes less preview-eager than before,
- fixed-string becomes less preview-eager than before,
- fixed-string remains slightly more inline-friendly than regex,
- and moderate recursive code-search workloads with compact result surfaces remain inline more often than they did before.

That is the family target state.
