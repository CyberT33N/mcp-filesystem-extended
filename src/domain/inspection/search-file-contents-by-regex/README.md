# README — `search_file_contents_by_regex`

## What this endpoint does

`search_file_contents_by_regex` searches text-compatible file content with a regular expression.

The accepted pattern surface is the intersection of:

- the local JavaScript regex guardrail used for zero-length protection and local match extraction
- the selected native `ugrep` execution lane

Use it when you need match locations, excerpts, and bounded continuation behavior for known file scopes or guarded directory-root search workloads.

---

## When to use it

- search known files or guarded directory roots with a regex pattern
- inspect where matches occur and what the matched excerpt looks like
- continue broad valid workloads through `next-chunk` or `complete-result`
- preserve successful roots even when another root fails locally

Do **not** use it as a replacement for:

- `search_file_contents_by_fixed_string`
- `count_lines`
- metadata endpoints
- direct file-read endpoints

---

## Key request knobs

- `roots` — explicit file or directory scopes
- `regex` — the search pattern
- `includeGlobs` / `excludeGlobs` / `includeExcludedGlobs` — narrowing controls
- `maxResults` — bounded location cap
- `caseSensitive` — case-sensitivity toggle
- `resumeToken` + `resumeMode` — same-endpoint continuation inputs for resumable sessions

---

## Key behavioral rules

- explicit large text-compatible files may still proceed through the shared regex lane
- directory-root workloads use the shared traversal admission planner first
- request-wide regex validation is lane-aware and resolves backend requirements such as lookahead or lookbehind before root execution begins
- regex remains text-first and does not imply unrestricted hybrid support
- per-root `error` surfaces preserve local failures without collapsing sibling roots
- request-wide regex contract failures do not degrade into per-root `error` payloads
- resumable responses keep full primary data in `content.text` and append continuation guidance afterward
- `complete-result` uses the global fuse as the final ceiling instead of the regex-family cap

---

## Local documentation surfaces

- [CONVENTIONS.md](./CONVENTIONS.md) — endpoint-local conventions, guardrails, and boundary rules
- [DESCRIPTION.md](./DESCRIPTION.md) — detailed endpoint architecture for LLM-agent consumption

This endpoint-local triplet is intended to be re-referenced later from root-level TOC documentation instead of being duplicated there.
