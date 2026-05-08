# CONVENTIONS — `diff_files` Endpoint

## Endpoint-Local SSOT Role

This file is the endpoint-local single source of truth for `diff_files` conventions and guardrails.

- `CONVENTIONS.md` owns endpoint-local rules, policy boundaries, and caller-facing guardrails.
- `DESCRIPTION.md` owns the detailed agent-oriented architecture explanation.
- `README.md` owns the concise DX summary.

The workspace-level `CONVENTIONS.md` is a TOC surface. It should re-reference this local file instead of duplicating endpoint-specific detail.

This endpoint also follows the global public-limit-disclosure policy in [`public-limit-disclosure-governance.md`](../../../../conventions/guardrails/public-limit-disclosure-governance.md).

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

## Public Limit Disclosure Placement

`diff_files` belongs to the file-backed comparison family and follows the global public-limit-disclosure policy with a diff-family-specific emphasis.

### Parameter-description disclosure (required)

Stable request-shape limits belong in the schema-owned parameter descriptions because callers need them while constructing the request.

For `diff_files`, that includes:

- path-length limits via `PATH_MAX_CHARS`
- pair-count ceiling via `MAX_COMPARISON_PAIRS_PER_REQUEST`

The endpoint-local rule is therefore:

> Request-shape limits must be disclosed in [`schema.ts`](./schema.ts) through constant-backed parameter descriptions.

### Tool-description disclosure (required)

Stable operation-wide delivery rules belong in the runtime tool description because they shape caller planning for the full diff surface.

For `diff_files`, that includes:

- successful file-backed diff output remains bounded by the file-diff family response cap
- oversized comparison sets must be narrowed or split

The endpoint-local rule is therefore:

> File-backed diff response budgeting must be disclosed in the runtime tool description through constant-backed builders rather than endpoint-local hardcoded prose.

### Non-prioritized internal limits (required non-disclosure rationale)

This endpoint must not promote the following internal or broader server-owned limits into its routine public tool description as if they were the primary caller target:

- the exact global fuse as the dominant optimization number
- internal diff shaping heuristics
- server-internal emergency/runtime guardrails

Those surfaces remain owned by shared architecture conventions because they are server-internal protection mechanics rather than the primary caller-actionable contract.

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
