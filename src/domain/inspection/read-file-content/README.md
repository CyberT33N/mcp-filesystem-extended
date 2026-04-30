# `read_file_content`

`read_file_content` is the advanced single-file read endpoint for explicit `full`, `line-range`, `byte-range`, and `chunk-cursor` access modes.

## Use this endpoint when

- you need single-file content access instead of a multi-file batch read,
- you need bounded line windows or bounded byte windows,
- you need cursor-based continuation for larger files,
- you need the advanced read surface that complements the bounded batch reader.

## Do not use this endpoint when

- you need one inline batch read across multiple files,
- you want the always-line-numbered bounded multi-file read surface,
- you want the small direct batch-reader role that belongs to `read_files_with_line_numbers`.

For those cases, use [`read_files_with_line_numbers`](../read-files-with-line-numbers/README.md).

## Public role

- Accepts exactly one file target.
- Exposes explicit `full`, `line-range`, `byte-range`, and `chunk-cursor` modes.
- Uses nested public option blocks for ranged and cursor reads before MCP-boundary normalization.
- Keeps the advanced single-file reader role separate from the bounded multi-file line-numbered reader.

## Internal architecture

This endpoint remains public as the advanced single-file reader, while overlapping full-text read and shaping behavior converges internally through the shared read-core infrastructure introduced by the finalized read-endpoint SSOT refactor.

## Local documentation

- [`CONVENTIONS.md`](./CONVENTIONS.md) — endpoint-local conventions, mode semantics, and guardrails.
- [`DESCRIPTION.md`](./DESCRIPTION.md) — endpoint-local architectural explanation for LLM agents.
