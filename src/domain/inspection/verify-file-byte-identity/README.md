# README — `verify_file_byte_identity`

## What this endpoint does

`verify_file_byte_identity` verifies whether one or more target files are byte-identical to a reference file — over the whole file or inside a bound byte region.

Use it when you need reference-based identity verification for known file paths — not when you need discovery, metadata lookup, raw file content, checksum generation, expected-hash verification, or diff diagnosis.

---

## When to use it

- verify whether known targets match the bytes of a reference file
- prove a governed region (a prefix ending at a marker line) across many files
- keep successful verification results even when some requested targets fail before comparison
- inspect aggregate `identical`, `different`, and `error` totals for a batch request

Do **not** use it as a replacement for:

- `get_file_checksums`
- `verify_file_checksums`
- `get_path_metadata`
- discovery endpoints
- file-content read endpoints
- `diff_files`

---

## Key request knobs

- `reference` — the reference file (`path` plus optional `region`)
- `targets` — the target files (`path` plus optional `region` each)
- `algorithm` — selected hash algorithm, defaulting to `sha256`

---

## Call examples

Whole-file identity:

```json
{
  "reference": { "path": "C:/canonical/home/.gitattributes" },
  "targets": [{ "path": "C:/tenants/repo-a/.gitattributes" }]
}
```

Governed-region identity (prefix through a marker line):

```json
{
  "reference": {
    "path": "C:/canonical/home/.gitignore",
    "region": { "mode": "prefix-through-marker", "marker": "# -- project additions below this line --" }
  },
  "targets": [
    {
      "path": "C:/tenants/repo-a/.gitignore",
      "region": { "mode": "prefix-through-marker", "marker": "# -- project additions below this line --" }
    }
  ]
}
```

Explicit byte window:

```json
{
  "reference": { "path": "C:/canonical/header.txt", "region": { "mode": "byte-range", "start": 0, "endExclusive": 512 } },
  "targets": [{ "path": "C:/tenants/repo-a/header.txt", "region": { "mode": "byte-range", "start": 0, "endExclusive": 512 } }]
}
```

---

## Key behavioral rules

- the reference path and every target path are validated against the allowed-directory boundary
- the reference region hash is computed once and reused for every target comparison
- verification compares normalized lowercase-and-trim hash strings
- region binding is fail-closed: an absent marker or an out-of-file range fails the affected file, and a failed reference fails the whole request
- multi-target requests may return `entries`, `errors`, and `summary` together
- different comparisons are different from pre-comparison errors
- the caller-visible text output stays concise and budget-bounded

---

## Local documentation surfaces

- [CONVENTIONS.md](./CONVENTIONS.md) — endpoint-local conventions, guardrails, and boundary rules
- [DESCRIPTION.md](./DESCRIPTION.md) — detailed endpoint architecture for LLM-agent consumption

This endpoint-local triplet is intended to be re-referenced later from root-level TOC documentation instead of being duplicated there.
