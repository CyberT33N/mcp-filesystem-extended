# `append_files`

`append_files` is the additive file-end write endpoint for caller-supplied text content.

## Use this endpoint when

- you need to append text to the end of a file,
- you want additive file-end mutation rather than explicit new-file creation or targeted replacement,
- you want the current runtime behavior that can materialize a missing target before appended content is written.

## Do not use this endpoint when

- you need explicit new-file creation with existing-target refusal,
- you need targeted replacement inside an existing text file,
- you want overwrite semantics.

For those cases, use the appropriate neighboring mutation surface instead of `append_files`.

## Public role

- Accepts `files[]` with `path` and `content`.
- Validates target path scope before writing.
- Creates missing parent directories automatically.
- Appends text to file end.
- Currently materializes a missing target file before appended content is written.
- Enforces per-item and cumulative content budgets before writing.
- Returns a concise mutation summary instead of echoing the full payload.

## Local documentation

- [`CONVENTIONS.md`](./CONVENTIONS.md) — endpoint-local conventions and guardrails.
- [`DESCRIPTION.md`](./DESCRIPTION.md) — endpoint-local architectural explanation for LLM agents.
