# README — `get_path_metadata`

## What this endpoint does

`get_path_metadata` returns structured metadata for one or more explicitly requested files or directories.

Use it when you need path facts such as `size`, `type`, and optional grouped timestamp or permission metadata — not when you need discovery, file content, or integrity hashes.

---

## When to use it

- inspect already known filesystem paths
- retrieve `size` and `type` for files or directories
- opt into grouped timestamp metadata when needed
- opt into grouped permission metadata when needed
- preserve successful lookups even when some requested paths fail

Do **not** use it as a replacement for:

- `list_directory_entries`
- `find_paths_by_name`
- `find_files_by_glob`
- file-content read endpoints
- checksum-generation or checksum-verification endpoints

---

## Key request knobs

- `paths` — requested files or directories
- `metadata` — grouped optional metadata selectors

---

## Key behavioral rules

- every requested path is validated against the allowed-directory boundary
- `size` and `type` are always present in successful entries
- grouped timestamps and permissions are opt-in
- multi-path requests may return both `entries` and `errors`
- single-path text output is a compact key-value block
- batch text output is a grouped metadata report

---

## Local documentation surfaces

- [CONVENTIONS.md](./CONVENTIONS.md) — endpoint-local conventions, guardrails, and boundary rules
- [DESCRIPTION.md](./DESCRIPTION.md) — detailed endpoint architecture for LLM-agent consumption

This endpoint-local triplet is intended to be re-referenced later from root-level TOC documentation instead of being duplicated there.
