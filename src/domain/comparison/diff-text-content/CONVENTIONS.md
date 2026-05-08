# CONVENTIONS — `diff_text_content` Endpoint

## Endpoint-Local SSOT Role

This file is the endpoint-local single source of truth for `diff_text_content` conventions and guardrails.

- `CONVENTIONS.md` owns endpoint-local rules, policy boundaries, and caller-facing guardrails.
- `DESCRIPTION.md` owns the detailed agent-oriented architecture explanation.
- `README.md` owns the concise DX summary.

The workspace-level `CONVENTIONS.md` is a TOC surface. It should re-reference this local file instead of duplicating endpoint-specific detail.

This endpoint also follows the global public-limit-disclosure policy in [`public-limit-disclosure-governance.md`](../../../../conventions/guardrails/public-limit-disclosure-governance.md).

---

## Architectural Principle: In-Memory Raw-Text Comparison Only

`diff_text_content` compares caller-supplied text that is already present in memory.

It must not be documented as:

- a file-backed diff surface,
- an on-disk comparison tool,
- or a merged comparison contract that also covers `diff_files`.

Use `diff_files` when the comparison sources already exist on disk and should be validated through the allowed-directory boundary before diff generation.

---

## Architectural Principle: Public Pair Contract

The public request surface is `pairs`.

Each pair uses the caller-facing fields:

- `leftContent`
- `rightContent`
- `leftLabel` (optional, default `original`)
- `rightLabel` (optional, default `modified`)

The current schema accepts:

- at least `1` pair,
- at most `10` pairs per request,
- raw text content bounded per content string by the shared raw-content schema cap,
- and optional labels bounded by the schema-level label limit.

The public contract stays left-versus-right at the schema boundary even though the handler maps each pair into an internal `content1` / `content2` / `label1` / `label2` shape before unified diff generation.

---

## Architectural Principle: Caller-Supplied Budgeting Is Stricter Than File-Backed Diffing

This endpoint accepts arbitrary raw text directly from the request body.

It therefore documents a stricter caller-supplied budget model than [`diff_files`](../diff-files/README.md):

- the handler rejects oversized cumulative raw-text input before diff generation begins,
- the text-diff family response cap is stricter than the file-backed diff family cap,
- callers must reduce pair count or shorten supplied content when those budgets are exceeded.

The currently relevant local limits are:

- `MAX_TOTAL_RAW_TEXT_REQUEST_CHARS = 400,000`
- `TEXT_DIFF_RESPONSE_CAP_CHARS = 240,000`

This endpoint must therefore be documented as a bounded raw-text comparison surface, not as an unbounded arbitrary text diff engine.

---

## Public Limit Disclosure Placement

`diff_text_content` belongs to the raw-text comparison family and follows the global public-limit-disclosure policy with a caller-supplied-content emphasis.

### Parameter-description disclosure (required)

Stable request-shape limits belong in the schema-owned parameter descriptions because callers need them while constructing the request.

For `diff_text_content`, that includes:

- pair-count ceiling via `MAX_RAW_TEXT_DIFF_PAIRS_PER_REQUEST`
- per-content ceiling via `RAW_CONTENT_MAX_CHARS`
- per-label ceiling via `LABEL_MAX_CHARS`

The endpoint-local rule is therefore:

> Request-shape limits must be disclosed in [`schema.ts`](./schema.ts) through constant-backed parameter descriptions.

### Tool-description disclosure (required)

Stable operation-wide delivery rules belong in the runtime tool description because they shape caller planning for the full diff surface.

For `diff_text_content`, that includes:

- successful raw-text diff output remains bounded by the raw-text diff family response cap
- oversized in-memory comparison sets must be shortened or split

The endpoint-local rule is therefore:

> Raw-text diff response budgeting must be disclosed in the runtime tool description through constant-backed builders rather than endpoint-local hardcoded prose.

### Non-prioritized internal limits (required non-disclosure rationale)

This endpoint must not promote the following internal or broader server-owned limits into its routine public tool description as if they were the primary caller target:

- the exact global fuse as the dominant optimization number
- internal diff shaping heuristics
- server-internal emergency/runtime guardrails

Those surfaces remain owned by shared architecture conventions because they are server-internal protection mechanics rather than the primary caller-actionable contract.

---

## Architectural Principle: Unified-Diff Output Shaping

`diff_text_content` returns unified diff output.

The current handler behavior is:

- a single pair returns one unified diff block,
- multiple pairs produce one deterministic batch-formatted comparison surface,
- batch labels preserve caller-visible pair identity in the form `<leftLabel> ↔ <rightLabel> (#N)`.

Per-pair failures inside a multi-pair request are preserved as normalized batch error entries instead of collapsing the whole batch into one opaque error surface.

---

## Architectural Principle: No Disk-Read Implication

This endpoint must not imply:

- filesystem reads,
- path validation against allowed directories,
- or on-disk source recovery.

Those behaviors belong to [`diff_files`](../diff-files/README.md).

`diff_text_content` starts from caller-supplied in-memory values and stays within that input model for the full request lifecycle.

---

## Re-Referenced Shared Guardrails

This endpoint re-references generic SSOT surfaces instead of redefining them:

- [Guardrails Overview](../../../../conventions/guardrails/overview.md)
- [MCP Client Governance](../../../../conventions/guardrails/mcp-client-governance.md)
- [Structured Content Contract](../../../../conventions/mcp-response-contract/structured-content-contract.md)

These shared documents own the cross-endpoint guardrail model. This local file documents only how those rules apply to `diff_text_content`.

---

## Comparison-Family Contrast Rule

The local documentation must explicitly preserve the comparison-family split:

- [`diff_files`](../diff-files/README.md) = validated on-disk file comparison
- `diff_text_content` = caller-supplied in-memory raw-text comparison

This contrast is mandatory and must not be collapsed into one undifferentiated local contract.

---

## Root Documentation Relationship

The workspace-level `README.md`, `DESCRIPTION.md`, and `CONVENTIONS.md` are root TOC surfaces.

They must later reference this local triplet for endpoint-specific raw-text diff detail instead of re-centralizing the `diff_text_content` contract at root level.
