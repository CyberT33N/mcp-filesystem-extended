# README — `count_lines`

## What this endpoint does

`count_lines` counts lines across files or traversed directory scopes.

Use it when the caller needs totals, and optionally matching-line totals for a regex, without turning the request into a full read or match-localization workflow.

---

## When to use it

- count total lines in one or more files,
- count total lines recursively beneath allowed directory roots,
- count how many lines match a regex,
- continue broad counting workloads through same-endpoint `complete-result` resume.

Do **not** use it as a replacement for:

- `search_file_contents_by_regex`,
- `search_file_contents_by_fixed_string`,
- `read_file_content`,
- `read_files_with_line_numbers`.

---

## Key request knobs

- `paths` — file or directory scopes,
- `recursive` — enable recursive directory traversal,
- `regex` — optional matching-line filter,
- `includeGlobs` / `excludeGlobs` / `includeExcludedGlobs` — recursive narrowing controls,
- `respectGitIgnore` — optional additive `.gitignore` narrowing,
- `ignoreEmptyLines` — exclude blank lines from totals,
- `resumeToken` + `resumeMode = 'complete-result'` — completion-backed continuation inputs.

---

## Key behavioral rules

- total-only counting uses a large-file-safe streaming path,
- pattern-aware counting stays a counting surface and does not expose match locations,
- broad recursive workloads may move into completion-backed same-endpoint resume,
- preview-style partial totals are intentionally unsupported,
- unsupported non-text states must surface explicit unsupported or reroute behavior rather than ambiguous ordinary totals.

---

## Local documentation surfaces

- [CONVENTIONS.md](./CONVENTIONS.md) — endpoint-local conventions, guardrails, and policy boundaries
- [DESCRIPTION.md](./DESCRIPTION.md) — detailed endpoint architecture for LLM-agent consumption

This endpoint-local triplet is intended to be re-referenced later from root-level TOC documentation instead of being duplicated there.
