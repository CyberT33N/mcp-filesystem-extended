# README — `find_paths_by_name`

## What this endpoint does

`find_paths_by_name` searches one or more roots for file and directory names that contain a case-insensitive substring and returns flat path matches grouped by root.

Use it when you need quick name-based discovery — not directory-shape preservation, glob matching, or file-content search.

---

## When to use it

- discover paths whose names contain a known substring
- search across more than one root while preserving root-local grouping
- continue broad discovery through the same-endpoint resume contract when needed

Do **not** use it as a replacement for:

- `list_directory_entries`
- `find_files_by_glob`
- file-content read endpoints
- regex or fixed-string content-search endpoints

---

## Key request knobs

- `roots` — requested traversal roots
- `nameContains` — case-insensitive substring over entry names
- `excludeGlobs` — additive narrowing
- `includeExcludedGlobs` — additive descendant reopening
- `respectGitIgnore` — optional secondary `.gitignore` enrichment
- `maxResults` — per-root match ceiling before truncation
- `resumeToken` + `resumeMode` — same-endpoint continuation

---

## Key behavioral rules

- matching is case-insensitive and name-based only
- both files and directories may match
- broad roots exclude default vendor, cache, and generated trees by default
- explicit roots inside excluded trees remain valid
- `structuredContent.admission` and `structuredContent.resume` are authoritative when present
- `complete-result` continuation is additive and continues from the persisted frontier

---

## Local documentation surfaces

- [CONVENTIONS.md](./CONVENTIONS.md) — endpoint-local conventions, guardrails, and boundary rules
- [DESCRIPTION.md](./DESCRIPTION.md) — detailed endpoint architecture for LLM-agent consumption

This endpoint-local triplet is intended to be re-referenced later from root-level TOC documentation instead of being duplicated there.
