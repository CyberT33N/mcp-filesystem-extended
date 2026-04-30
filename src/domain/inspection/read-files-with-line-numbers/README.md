# `read_files_with_line_numbers`

`read_files_with_line_numbers` is the bounded inline batch-read endpoint for one or more text files when callers need full text plus inline absolute line numbers.

## Use this endpoint when

- you need one call that reads one or more smaller text files inline,
- you need line-numbered output for precise later references or patch targeting,
- you need a direct full-file anchor before analysis or editing workflows.

## Do not use this endpoint when

- you need advanced single-file access modes,
- you need bounded line windows, byte windows, or cursor-based continuation,
- you need a large-file-safe single-file read path.

For those cases, use [`read_file_content`](../read-file-content/README.md).

## Public role

- Accepts a bounded batch through the `paths` array.
- Returns one line-numbered text block per file.
- Keeps the public multi-file read role separate from the advanced single-file reader.

## Internal architecture

This endpoint remains public as the small multi-file line-numbered reader, while overlapping full-text read and line-number formatting behavior is shared internally through the read-core infrastructure.

## Local documentation

- [`CONVENTIONS.md`](./CONVENTIONS.md) — endpoint-local conventions, guardrails, and coexistence rules.
- [`DESCRIPTION.md`](./DESCRIPTION.md) — endpoint-local architectural explanation for LLM agents.
