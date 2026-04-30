# README — `get_file_checksums`

## What this endpoint does

`get_file_checksums` generates checksums for one or more explicitly requested files.

Use it when you need deterministic hash output for known file paths — not when you need discovery, metadata lookup, or verification against expected values.

---

## When to use it

- generate checksums for already known file paths
- choose a supported hash algorithm explicitly
- keep successful hash results even when some requested files fail

Do **not** use it as a replacement for:

- `get_path_metadata`
- discovery endpoints
- file-content read endpoints
- `verify_file_checksums`

---

## Key request knobs

- `paths` — requested files
- `algorithm` — selected hash algorithm, defaulting to `sha256`

---

## Key behavioral rules

- every requested path is validated against the allowed-directory boundary
- the endpoint is generation-only, not verification-oriented
- multi-file requests may return both `entries` and `errors`
- the caller-visible text output stays concise and budget-bounded

---

## Local documentation surfaces

- [CONVENTIONS.md](./CONVENTIONS.md) — endpoint-local conventions, guardrails, and boundary rules
- [DESCRIPTION.md](./DESCRIPTION.md) — detailed endpoint architecture for LLM-agent consumption

This endpoint-local triplet is intended to be re-referenced later from root-level TOC documentation instead of being duplicated there.
