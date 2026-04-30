# README — `list_directory_entries`

## What this endpoint does

`list_directory_entries` lists one or more directory roots and returns structured directory entries with optional recursion and grouped metadata.

Use it when you need directory shape, relative entry paths, and metadata — not when you need flat discovery results or file body content.

---

## When to use it

- inspect the structure beneath one or more roots
- keep nested directory hierarchy when `recursive = true`
- retrieve `type` and `size` for listed entries
- opt into grouped timestamp or permission metadata when needed

Do **not** use it as a replacement for:

- `find_paths_by_name`
- `find_files_by_glob`
- file-content read endpoints
- content-search endpoints

---

## Key request knobs

- `roots` — requested directory roots
- `recursive` — defaults to `false`
- `metadata` — widens optional grouped metadata
- `excludeGlobs` — additive narrowing
- `includeExcludedGlobs` — additive descendant reopening
- `respectGitIgnore` — optional secondary `.gitignore` enrichment
- `resumeToken` + `resumeMode` — same-endpoint continuation

---

## Key behavioral rules

- broad roots exclude default vendor, cache, and generated trees by default
- explicit roots inside excluded trees remain valid
- `structuredContent.admission` and `structuredContent.resume` are authoritative when present
- preview-first responses may surface a bounded directory-entry payload and active `resumeToken` in `content.text`
- `complete-result` continuation is additive and continues from the persisted frontier

---

## Local documentation surfaces

- [CONVENTIONS.md](./CONVENTIONS.md) — endpoint-local conventions, guardrails, and boundary rules
- [DESCRIPTION.md](./DESCRIPTION.md) — detailed endpoint architecture for LLM-agent consumption

This endpoint-local triplet is intended to be re-referenced later from root-level TOC documentation instead of being duplicated there.
