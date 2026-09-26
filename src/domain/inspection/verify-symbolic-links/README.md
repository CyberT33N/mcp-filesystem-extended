# README — `verify_symbolic_links`

## What this endpoint does

`verify_symbolic_links` verifies one or more explicitly requested symbolic links: it proves the entry is a link, reads the stored target, checks target resolvability, and optionally compares the stored target against an expected value.

Use it when you need integrity validation for known link paths — not when you need link creation, discovery, metadata lookup, or file content.

---

## When to use it

- verify whether known paths are symbolic links whose targets resolve
- detect target drift against an expected stored target
- detect dangling links
- run an idempotency pre-check before a planned `create_symbolic_links` call
- inspect aggregate `valid`, `invalid`, and `error` totals for a batch request

Do **not** use it as a replacement for:

- `create_symbolic_links`
- `get_path_metadata`
- discovery endpoints
- file-content read endpoints

---

## Key request knobs

- `links` — requested link entries with `path` and optional `expectedTarget`

---

## Key behavioral rules

- every requested path is validated against the allowed-directory boundary while preserving the link identity
- comparison uses exact trimmed string equality against the verbatim stored target
- a dangling link is an invalid entry, never an error
- a non-link path reports `actualTarget: null` and `valid: false`
- multi-link requests may return `entries`, `errors`, and `summary` together
- invalid judgments are different from pre-judgment errors
- the caller-visible text output stays concise and budget-bounded

---

## Local documentation surfaces

- [CONVENTIONS.md](./CONVENTIONS.md) — endpoint-local conventions, guardrails, and boundary rules
- [DESCRIPTION.md](./DESCRIPTION.md) — detailed endpoint architecture for LLM-agent consumption

This endpoint-local triplet is intended to be re-referenced later from root-level TOC documentation instead of being duplicated there.
