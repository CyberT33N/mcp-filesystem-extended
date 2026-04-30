# `create_files`

`create_files` is the additive new-file creation endpoint for caller-supplied text content.

## Use this endpoint when

- the target files do not already exist,
- you want to create full text files from caller-supplied content,
- you want the bounded new-file creation surface of the content-mutation family.

## Do not use this endpoint when

- you need to append to an existing file,
- you need targeted replacement inside an existing text file,
- you want overwrite behavior on an already existing file.

For those cases, use the appropriate existing-file mutation surface instead of `create_files`.

## Public role

- Accepts `files[]` with `path` and `content`.
- Creates missing parent directories automatically.
- Refuses writes when the target file already exists.
- Enforces per-item and cumulative content budgets before writing.
- Returns a concise mutation summary instead of echoing the full payload.

## Local documentation

- [`CONVENTIONS.md`](./CONVENTIONS.md) — endpoint-local conventions and guardrails.
- [`DESCRIPTION.md`](./DESCRIPTION.md) — endpoint-local architectural explanation for LLM agents.
