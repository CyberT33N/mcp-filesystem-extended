# README — `search_file_contents_by_fixed_string`

## What this endpoint does

`search_file_contents_by_fixed_string` searches file content for an exact fixed string.

Use it when you need exact-match locations, caller-visible excerpts, and bounded continuation behavior for known file scopes or guarded directory-root search workloads.

---

## When to use it

- search known files or guarded directory roots with an exact literal value,
- inspect where exact matches occur and what the emitted excerpt looks like,
- prefer the literal lane instead of regex semantics when the target value is already known,
- continue broad valid workloads through `next-chunk` or `complete-result`,
- preserve successful roots even when another root fails locally.

Do **not** use it as a replacement for:

- `search_file_contents_by_regex`,
- `count_lines`,
- metadata endpoints,
- direct file-read endpoints.

---

## Key request knobs

- `roots` — explicit file or directory scopes,
- `fixedString` — the exact literal value to match,
- `includeGlobs` / `excludeGlobs` / `includeExcludedGlobs` — narrowing controls,
- `maxResults` — bounded location cap,
- `caseSensitive` — case-sensitivity toggle,
- `resumeToken` + `resumeMode` — same-endpoint continuation inputs for resumable sessions.

---

## Key behavioral rules

- explicit large text-compatible files may still proceed through the shared fixed-string lane,
- directory-root workloads use the shared traversal admission planner first,
- this endpoint is the preferred literal lane for supported text-compatible and text-dominant hybrid-searchable workloads,
- unsupported pure-binary or binary-dominant surfaces still refuse,
- per-root `error` surfaces preserve local failures without collapsing sibling roots,
- resumable responses keep full primary data in `content.text` and append continuation guidance afterward,
- `complete-result` uses the global fuse as the final ceiling instead of the family cap.

---

## Local documentation surfaces

- [CONVENTIONS.md](./CONVENTIONS.md) — endpoint-local conventions, guardrails, and boundary rules
- [DESCRIPTION.md](./DESCRIPTION.md) — detailed endpoint architecture for LLM-agent consumption

This endpoint-local triplet is intended to be re-referenced later from root-level TOC documentation instead of being duplicated there.
