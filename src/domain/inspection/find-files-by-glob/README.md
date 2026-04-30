# README — `find_files_by_glob`

## What this endpoint does

`find_files_by_glob` searches one or more roots for paths that match a caller-supplied glob and returns flat matches grouped by root.

Use it when you need glob-based discovery — not directory-shape preservation, plain substring matching, or file-content search.

---

## When to use it

- discover paths that match a known glob pattern
- search across more than one root while preserving root-local grouping
- continue broad discovery through the same-endpoint resume contract when needed

Do **not** use it as a replacement for:

- `list_directory_entries`
- `find_paths_by_name`
- file-content read endpoints
- regex or fixed-string content-search endpoints

---

## Key request knobs

- `roots` — requested traversal roots
- `glob` — path-oriented glob evaluated beneath each root
- `excludeGlobs` — additive narrowing
- `includeExcludedGlobs` — additive descendant reopening
- `respectGitIgnore` — optional secondary `.gitignore` enrichment
- `maxResults` — per-root match ceiling before truncation
- `resumeToken` + `resumeMode` — same-endpoint continuation

---

## Key behavioral rules

- matching is glob-based over relative traversal paths
- results stay grouped by requested root and are returned as flat matches
- broad roots exclude default vendor, cache, and generated trees by default
- explicit roots inside excluded trees remain valid
- `structuredContent.admission` and `structuredContent.resume` are authoritative when present
- `complete-result` continuation is additive and continues from the persisted frontier

---

## Local documentation surfaces

- [CONVENTIONS.md](./CONVENTIONS.md) — endpoint-local conventions, guardrails, and boundary rules
- [DESCRIPTION.md](./DESCRIPTION.md) — detailed endpoint architecture for LLM-agent consumption

This endpoint-local triplet is intended to be re-referenced later from root-level TOC documentation instead of being duplicated there.
