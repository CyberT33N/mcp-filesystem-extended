# README — `verify_file_checksums`

## What this endpoint does

`verify_file_checksums` verifies one or more explicitly requested files against caller-supplied expected hash values.

Use it when you need integrity validation for known file paths — not when you need discovery, metadata lookup, raw file content, or checksum generation without comparison.

---

## When to use it

- verify whether known files match expected hashes
- inspect which files are valid versus invalid under a selected algorithm
- keep successful verification results even when some requested files fail before comparison
- inspect aggregate `valid`, `invalid`, and `error` totals for a batch request

Do **not** use it as a replacement for:

- `get_file_checksums`
- `get_path_metadata`
- discovery endpoints
- file-content read endpoints

---

## Key request knobs

- `files` — requested file and expected-hash pairs
- `algorithm` — selected hash algorithm, defaulting to `sha256`

---

## Key behavioral rules

- every requested path is validated against the allowed-directory boundary
- verification compares normalized lowercase-and-trim hash strings
- the endpoint is verification-oriented, not generation-only
- multi-file requests may return `entries`, `errors`, and `summary` together
- invalid comparisons are different from pre-comparison errors
- the caller-visible text output stays concise and budget-bounded

---

## Local documentation surfaces

- [CONVENTIONS.md](./CONVENTIONS.md) — endpoint-local conventions, guardrails, and boundary rules
- [DESCRIPTION.md](./DESCRIPTION.md) — detailed endpoint architecture for LLM-agent consumption

This endpoint-local triplet is intended to be re-referenced later from root-level TOC documentation instead of being duplicated there.
