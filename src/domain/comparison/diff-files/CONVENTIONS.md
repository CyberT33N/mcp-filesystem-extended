# CONVENTIONS — `diff_files` Endpoint

## Endpoint-Local SSOT Role

This file is the endpoint-local single source of truth for `diff_files` conventions and guardrails.

- `CONVENTIONS.md` owns endpoint-local rules, policy boundaries, and caller-facing guardrails.
- `DESCRIPTION.md` owns the detailed agent-oriented architecture explanation.
- `README.md` owns the concise DX summary.

The workspace-level `CONVENTIONS.md` is a TOC surface. It should re-reference this local file instead of duplicating endpoint-specific detail.

---

## Architectural Principle: File-Backed Comparison Only

`diff_files` compares sources that already exist on disk.

It must not be documented as:

- a raw-text diff surface,
- a caller-supplied text comparison tool,
- or a merged comparison contract that also covers `diff_text_content`.

Use `diff_text_content` when the comparison inputs are provided directly by the caller as in-memory text instead of filesystem-backed files.

---

## Architectural Principle: Public Pair Contract

The public request surface is `pairs`.

Each pair uses the caller-facing fields:

- `leftPath`
- `rightPath`

The current schema accepts:

- at least `1` pair,
- at most `25` pairs per request,
- and path strings up to `4,096` characters.

The public contract stays left-versus-right at the schema boundary even though the handler maps each pair into an internal `file1` / `file2` shape before unified diff generation.

---

## Architectural Principle: Allowed-Directory and On-Disk Validation

Every caller-supplied path is validated against the configured allowed-directory scope before content is read from disk.

The endpoint therefore documents a file-backed comparison contract with these invariants:

- both paths must pass the shared path guard,
- both comparison sources are read from disk,
- no in-memory fallback path is implied,
- no unrestricted workspace-wide path access is implied.

---

## Architectural Principle: Unified-Diff Output Shaping

`diff_files` returns unified diff output.

The current handler behavior is:

- a single pair returns the unified diff for that pair,
- an empty textual diff returns `Files are identical.`,
- multiple pairs produce one batch-formatted comparison surface.

Batch results keep the caller-visible pair identity in the label format `<leftPath> ↔ <rightPath>`.

When one pair fails during a multi-pair request, the batch surface keeps the other pair results and emits a normalized per-pair error entry in the form `Error comparing files: <message>`.

---

## Architectural Principle: Response Budgeting

This endpoint belongs to the file-backed diff family.

The current output limits that matter locally are:

- `FILE_DIFF_RESPONSE_CAP_CHARS = 300,000`
- `GLOBAL_RESPONSE_HARD_CAP_CHARS = 600,000`

The local documentation must therefore describe `diff_files` as a bounded comparison surface. When the projected diff output is too large, callers must narrow the comparison set rather than expecting unbounded output.

---

## Re-Referenced Shared Guardrails

This endpoint re-references generic SSOT surfaces instead of redefining them:

- `conventions/guardrails/overview.md`
- `conventions/guardrails/mcp-client-governance.md`
- `conventions/mcp-response-contract/structured-content-contract.md`

These shared documents own the cross-endpoint guardrail model. This local file documents only how those rules apply to `diff_files`.

---

## Root Documentation Relationship

The workspace-level `README.md`, `DESCRIPTION.md`, and `CONVENTIONS.md` are root TOC surfaces.

They must later reference this local triplet for endpoint-specific comparison detail instead of re-centralizing the `diff_files` contract at root level.
