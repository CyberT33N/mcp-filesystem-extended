# README — Inspection Search Family

## What this family does

The `inspection/search` family contains the inspection endpoints that localize content matches inside validated file and directory scopes.

Current members:
- [`search_file_contents_by_regex`](./search-file-contents-by-regex/README.md)
- [`search_file_contents_by_fixed_string`](./search-file-contents-by-fixed-string/README.md)

---

## Why this family exists

These endpoints share:
- content-localization as the primary business result,
- text-compatible search eligibility,
- preview-first plus additive `complete-result` continuation,
- bounded match-location output,
- and the same architectural risk of becoming too preview-eager.

They differ in match semantics:
- regex search is pattern-oriented,
- fixed-string search is exact-literal-oriented.

So the family owns the shared rules and each endpoint owns its specialization.

---

## Key family rule

Preview-first must remain available, but it must **not** trigger so early that moderate recursive code-search workloads almost always require a second `complete-result` call.

That is the central architectural problem this family layer exists to govern.

---

## Search-family tuning direction

The family keeps the resume architecture, but retunes admission so that:
- regex search becomes less preview-eager than before,
- fixed-string search also becomes less preview-eager than before,
- and fixed-string remains slightly more inline-friendly than regex.

Family-owned threshold constants live in [`search-family-thresholds.ts`](./search-family-thresholds.ts).

For admitted inline directory-root workloads, the family now also groups validated native-searchable file candidates into ordered shell-free native `ugrep` batches instead of relying only on one native process per file.
That execution correction is required so the relaxed admission posture and the actual inline runtime behavior stay aligned.

---

## Family documentation surfaces

- [CONVENTIONS.md](./CONVENTIONS.md) — family-level conventions, threshold philosophy, and shared rationale
- [DESCRIPTION.md](./DESCRIPTION.md) — detailed architecture for the search-family layer
- [search-family-thresholds.ts](./search-family-thresholds.ts) — family-owned threshold constants and business-code tuning surface

Endpoint-local details remain inside each endpoint folder.
