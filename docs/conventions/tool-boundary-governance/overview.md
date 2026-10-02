# Convention: Tool Boundary Governance — Line Endings and Content Normalization

> **Context:** See [`CONVENTIONS.md`](../../../CONVENTIONS.md) for the root conventions index of this workspace.
> **Scope:** Server-architecture convention for what this MCP server deliberately does **not** own: line-ending verification or mutation (LF/CRLF/CR), content formatting, and content normalization. This document owns the boundary decision, the domain-driven ownership analysis, and the responsibility split; endpoint-local mechanics remain owned by the endpoint-local documentation triplets.

---

## Purpose

This document is the single source of truth for the decision that this server provides **no line-ending endpoints** — neither verifying nor mutating — and **no formatting endpoints**, and for the ownership analysis that places content normalization at the organization's declaration, toolchain, and CI layers instead of behind a filesystem boundary.

---

## What Was Decided

1. **No line-ending endpoints exist.** The tool catalog exposes no endpoint that detects, verifies, converts, or normalizes line endings (LF, CRLF, CR) — not for single files, not for batches, not recursively for directory trees.
2. **No formatting endpoints exist.** The tool catalog exposes no endpoint that pretty-prints, reformats, or format-checks content. Formatting is language-specific toolchain capability (Prettier, ESLint + `@stylistic`, Black, gofmt, rustfmt, …) and is never re-implemented behind a filesystem boundary.
3. **Mutation stays byte-faithful.** The write surfaces (`create_files`, `append_files`, `replace_file_line_ranges`) persist exactly the caller-supplied content. No silent line-ending or whitespace normalization happens on write or on read; a write/read round trip is identity-preserving by contract.
4. **Integrity surfaces stay honest.** `verify_file_byte_identity`, `get_file_checksums`, and `verify_file_checksums` compare bytes as stored. Their answers are trustworthy precisely because no normalization layer silently mutates content behind their backs; a normalizing write path would corrupt the meaning of these verification primitives.
5. **CR-only is out of scope.** Classic Mac line endings are legacy; the LF/CRLF parity question is fully owned by the VCS declaration layer.

---

## Ownership Matrix (Domain-Driven Analysis)

| Responsibility | Owner |
|---|---|
| Declaring the canonical line-ending and format policy | Organization / repository: `.gitattributes` (this workspace: `* text=auto eol=lf`), `.editorconfig` |
| Normalizing line endings at defined points | Git (commit/checkout), editors on save, formatter runs |
| Enforcing the convention with a failure process | CI check mode (for example `prettier --check`, `git ls-files --eol` probes) and pre-commit hooks — never silent auto-fixing |
| Language-specific formatting | Dedicated formatter toolchains per ecosystem |
| Faithful, bounded, auditable file operations | **This server** |
| Byte-level integrity verification primitives | **This server** (`verify_file_byte_identity`, `get_file_checksums`, `verify_file_checksums`) |
| Line-ending conversion, formatting, recursive normalization | **Forbidden for the server** |

---

## Why These Decisions Hold

### Why normalization is not a filesystem-server capability

Three binding reasons:

1. **Boundary:** content semantics are not filesystem operations. This server's bounded context is faithful, capped, auditable operation over paths and bytes; which bytes *should* look like is policy owned above the boundary.
2. **Admission and caps collision:** recursive normalization would be a bulk mutation workload of unknown volume — exactly the workload class that the admission projection, the resume architecture, and the hard caps bound for read and discovery work. A mutating surface of the same volume profile would fight the server's own guardrail architecture instead of fitting it.
3. **Single source of truth:** two normalizers (toolchain and server) drift. The formatter toolchain and the VCS declaration are the maintained authorities; a server-side normalizer would be a redundant, unmaintained duplicate.

### Why agents must not compensate

Ad-hoc agent "corrections" of line endings are the symptom of a missing declaration or enforcement layer, not an architecture. They produce diff noise, mask absent CI gates, and invent per-file policy. Once the convention is declared (`.gitattributes`, `.editorconfig`) and enforced (CI failure process), every consumer — human, agent, or tool — inherits deterministic truth instead of improvising it.

### Where each information class lives

| Information class | Owning surface |
|---|---|
| Line-ending and format policy declaration | `.gitattributes` / `.editorconfig` (VCS layer) |
| Convention enforcement with a failure process | CI and hooks |
| Tool boundary decisions (this and future scope questions) | This document |
| Endpoint-local mechanics | Endpoint-local documentation triplets |

---

## Verification

- The tool catalog exposes no endpoint whose name, schema, or description mentions line endings, EOL, formatting, or normalization.
- The mutation surfaces persist caller bytes verbatim; a write/read round trip through the read endpoints is byte-identical (provable with `verify_file_byte_identity` against a reference).
- This workspace's own `.gitattributes` declares `* text=auto eol=lf`, demonstrating the declared-and-enforced alternative at the correct layer.

---

## Non-Goals

- This convention does not add EOL detection or statistics, conversion, formatting, or format-check endpoints.
- This convention does not redefine the restricted write-endpoint class or the guardrail layers; it records a scope boundary, not a runtime guardrail.
- This convention does not own per-language formatting rules; those live in the formatter toolchains and their configurations.
