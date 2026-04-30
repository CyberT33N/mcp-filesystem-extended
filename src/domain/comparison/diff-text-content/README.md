# `diff_text_content`

`diff_text_content` is the in-memory raw-text comparison endpoint for unified diffs between caller-supplied text pairs.

## Use this endpoint when

- you already have both comparison sources in memory,
- you want unified diff output for one or more raw-text pairs,
- you want the bounded raw-text comparison surface of the comparison family.

## Do not use this endpoint when

- your comparison sources already exist on disk,
- you need filesystem path validation and on-disk reads,
- you want the file-backed comparison role that belongs to [`diff_files`](../diff-files/README.md).

For those cases, use [`diff_files`](../diff-files/README.md).

## Public role

- Accepts `pairs` with `leftContent` and `rightContent`.
- Supports optional `leftLabel` and `rightLabel` with stable defaults.
- Applies stricter cumulative raw-text budgeting before diff generation.
- Returns unified diff output bounded by the text-diff family cap.
- Keeps the raw-text comparison role separate from file-backed diffing.

## Local documentation

- [`CONVENTIONS.md`](./CONVENTIONS.md) — endpoint-local conventions and guardrails.
- [`DESCRIPTION.md`](./DESCRIPTION.md) — endpoint-local architectural explanation for LLM agents.
