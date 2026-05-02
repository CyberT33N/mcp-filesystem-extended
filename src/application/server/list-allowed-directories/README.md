# `list_allowed_directories`
[INTENT: CONTEXT]

Lists the effective filesystem roots that the running MCP server may access.

---

## What this endpoint does
[INTENT: CONTEXT]

- exposes the current `allowedDirectories` scope,
- returns a text-only list of allowed root directories,
- helps callers understand server scope before path-based calls.

---

## Request shape at a glance
[INTENT: REFERENCE]

- no caller-supplied arguments
- text-only output built from the server-owned allowed-directory scope

---

## Use this endpoint when
[INTENT: CONTEXT]

- the caller needs to confirm which directory roots the server may access,
- scope clarification is needed before path-based inspection or mutation work,
- the application-owned server boundary must be surfaced explicitly.

---

## Do not use it for
[INTENT: CONSTRAINT]

- listing directory contents,
- reading files,
- searching for paths,
- mutating filesystem state.

---

## Local documentation
[INTENT: REFERENCE]

- [`CONVENTIONS.md`](./CONVENTIONS.md) — endpoint-local conventions and guardrails
- [`DESCRIPTION.md`](./DESCRIPTION.md) — endpoint-local architectural description for LLM agents
