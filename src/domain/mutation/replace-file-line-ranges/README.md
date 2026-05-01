# `replace_file_line_ranges`
[INTENT: CONTEXT]

Direct 1-based inclusive line-range replacement for existing text files.

---

## What this endpoint does
[INTENT: CONTEXT]

- replaces one or more explicit line ranges inside existing text files,
- accepts direct `replacementText` payloads instead of unified diff patch text,
- supports preview mode through `dryRun`,
- keeps the operation bounded with per-file, cumulative-input, and preview-output guardrails.

---

## Request shape at a glance
[INTENT: REFERENCE]

- `files[]`
  - `path`
  - `replacements[]`
    - `startLine`
    - `endLine`
    - `replacementText`
- optional `dryRun`

Ranges are 1-based and inclusive.

---

## Use this endpoint when
[INTENT: CONTEXT]

- the target file already exists,
- the caller knows the exact line coordinates,
- the change should stay bounded and previewable,
- direct replacement text is available.

---

## Do not use it for
[INTENT: CONSTRAINT]

- creating new files,
- appending text at file end,
- sending unified diff patch text,
- describing the operation as a general overwrite surface.

For those cases, use the mutation surface that actually owns that behavior.

---

## Key guardrails
[INTENT: REFERENCE]

- up to `50` files per request,
- up to `25` replacements per file,
- up to `100000` characters for one `replacementText`,
- up to `300000` cumulative `replacementText` characters per request,
- up to `300000` preview-output characters for the diff-style result surface.

---

## Local documentation
[INTENT: REFERENCE]

- [`CONVENTIONS.md`](./CONVENTIONS.md) — endpoint-local conventions and guardrails
- [`DESCRIPTION.md`](./DESCRIPTION.md) — endpoint-local architectural description for LLM agents
