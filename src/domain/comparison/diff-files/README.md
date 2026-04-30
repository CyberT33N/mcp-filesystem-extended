# `diff_files`

`diff_files` is the file-backed comparison endpoint for unified diffs between files that already exist on disk.

## Use this endpoint when

- you already have both comparison sources on disk,
- you want unified diff output for one or more file pairs,
- you want the bounded file-backed diff surface of the comparison family.

## Do not use this endpoint when

- you need to diff caller-supplied in-memory text,
- you want raw-text comparison semantics,
- you want to bypass pair-count or response-budget limits.

For those cases, use `diff_text_content` for raw-text input or reduce the file-pair scope.

## Public role

- Accepts `pairs` with `leftPath` and `rightPath`.
- Validates both paths against the allowed-directory scope.
- Reads files from disk before generating unified diffs.
- Returns `Files are identical.` when no textual diff exists.
- Applies the file-backed diff family budget instead of the raw-text diff budget.

## Local documentation

- `CONVENTIONS.md` — endpoint-local conventions and guardrails.
- `DESCRIPTION.md` — endpoint-local architectural explanation for LLM agents.
