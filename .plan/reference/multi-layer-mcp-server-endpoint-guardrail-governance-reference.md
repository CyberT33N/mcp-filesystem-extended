---
file_type: "reference"
reference_id: "multi-layer-mcp-server-endpoint-guardrail-governance"
title: "Multi-layer MCP server endpoint guardrail governance reference"
status: "active"
architecture_scope: "mcp_server_guardrails"
---

# Multi-layer MCP Server Endpoint Guardrail Governance Reference

## Purpose

This reference defines the canonical enterprise-grade guardrail architecture for this MCP server rollout.
It exists so the HCOA plan remains self-contained and does not depend on external absolute-path prompt or cheat-sheet artifacts.

## Canonical Architecture Decision

The server uses a multi-layer guardrail model with four non-substitutable control planes:

1. **Schema / contract layer** for all statically expressible hard limits.
2. **Handler preflight layer** for metadata-derived or aggregate risks that become knowable only after resolving real inputs.
3. **Endpoint runtime fuse layer** for growth that becomes visible only during execution.
4. **Global output fuse layer** as the final non-bypassable server-wide response cap.

No single layer may silently compensate for the absence of an earlier one.

## Guardrail Layer Responsibilities

| Layer | Primary responsibility | Typical signals | Non-negotiable rule |
|------|-------------------------|-----------------|---------------------|
| Schema / contract | Static request-shape constraints | array size, string length, numeric max, enum, defaults | Every statically expressible hard limit must live in the contract surface. |
| Handler preflight | Dynamic risks visible before heavy execution | resolved file metadata, aggregate bytes, recursive breadth, candidate counts | Expensive or wide work must be rejected before full processing begins. |
| Endpoint runtime fuse | Execution-time growth | match density, diff growth, traversal fan-out, collected result count | The endpoint must stop itself as soon as runtime growth crosses its family budget. |
| Global output fuse | Final serialized response protection | text length, content block totals, structured payload size | No successful response may escape the server-wide hard cap. |

## Endpoint Family Classification

| Endpoint family | Primary risk | Mandatory emphasis |
|------|------|------|
| Search / discovery | result explosion and match density | schema + preflight + runtime fuse + global fuse |
| File read / content return | oversized content return | schema + metadata preflight + global fuse |
| Metadata / listing / count | recursive breadth and structured response growth | schema + preflight + family-specific output control + global fuse |
| Raw content / diff | oversized request payload plus output amplification | schema + aggregate request budget + runtime fuse + global fuse |
| Mutation / side effects | blast radius and unintended mass action | schema + handler safety checks + minimal output |
| Administrative / scope | contract integrity and disclosure | minimal schema + small output |

## Canonical Ownership Rules

- Static limits belong in `src/domain/shared/guardrails/tool-guardrail-limits.ts`.
- Shared refusal semantics belong in `src/domain/shared/guardrails/tool-guardrail-error-contract.ts`.
- Shared projection, preflight, and budget helpers belong in the shared guardrail modules rather than in endpoint-local literal logic.
- Same-concept contract surfaces must remain canonical across schema, handler, and helper layers.
- Endpoint-local literals are forbidden when a canonical shared value already exists.

### Same-Concept Property Surface Rule

When one business meaning crosses schema and runtime layers, the property name must remain canonical unless a real semantic difference exists.
Example: line-range replacement payloads use `replacementText` as the canonical same-concept surface; a parallel `newText` runtime contract is drift and must be normalized away unless an explicitly documented adapter boundary owns that translation.

## Static Property Governance

Every exposed property must use the right class of limit instead of ad hoc endpoint-local numbers.

| Property class | Typical examples | Required treatment |
|------|------|------|
| Identifier / label | ids, labels, names | bounded length, stable semantics |
| Path / root | paths, roots, destinations | bounded length, bounded batch size |
| Pattern | regex, glob, nameContains | bounded length, bounded collection size |
| Numeric control | maxResults, budgets | minimum, maximum, conservative default |
| Raw content | content, replacement text, inline diff text | per-field max plus aggregate request budget |
| Batch container | files, paths, operations, pairs | explicit maxItems and non-empty rules where needed |

## Dynamic Preflight Rules

- Path count alone is never the sole risk model for content-oriented endpoints.
- Metadata-first admission control is mandatory when resolved file size, aggregate bytes, or file type determine safety.
- Preflight must answer the risk question before the expensive content loop starts.
- Resolved metadata must be reused through shared helpers instead of duplicated per endpoint.

## Runtime Fuse Rules

- Search endpoints must enforce runtime budgets for candidate bytes, collected result count, and final formatted output.
- Diff endpoints must protect both aggregate input size and emitted diff size.
- Mutation endpoints must refuse oversized or overly broad batches before the first write or destructive side effect occurs.
- Successful output must not be silently truncated when the architecture explicitly requires refusal.

## Global Output Fuse Rules

- The global fuse is always active.
- It is a final safety floor, not the primary control plane.
- Callers may request narrower scope but may never disable, override, or raise the server hard cap.
- The global fuse must preserve pre-existing error results and only convert oversize successful responses into canonical guardrail failures.

## Search and Regex Governance

- Broad semantic blacklists are forbidden as the primary protection model.
- Regex safety uses a tiny structural reject layer plus budgets.
- Legitimate high-frequency searches such as literal whitespace or `\s` remain valid and are controlled by scope, candidate-byte budgets, result caps, and final response caps.
- Reject only structurally unsafe or operationally useless regex cases such as invalid syntax, empty patterns, or zero-length matching patterns.

## File-Read Governance

- Direct file-read endpoints must validate request-shape caps in schema.
- They must run metadata-first admission control before any file-content loop begins.
- They must refuse projected oversize reads rather than truncating successful content responses.
- The global output fuse still remains active even after preflight succeeds.

## Raw Content and Diff Governance

- Per-field text caps and aggregate request budgets are both mandatory.
- File-based diffs and in-memory diffs use different family caps when caller-controlled raw text increases abuse potential.
- Output truncation is not the default safety strategy; refusal is preferred where the plan says successful output must remain complete.

## Mutation Governance

- Content-bearing mutation endpoints are governed primarily by cumulative request text budgets before writes begin.
- Path-mutation endpoints are governed primarily by blast radius, batch size, overlap conflict detection, and non-bypassable defensive runtime checks.
- Mutation success summaries should remain concise and should not echo large content bodies.

## Caller-Visible Contract Rules

- Visible descriptions must guide callers toward narrower requests.
- Visible descriptions must never imply that hard caps are caller-overridable.
- Server-level instructions may summarize safety posture, but must not drift from implemented behavior.
- When exact numeric values are not derived directly from shared constants at registration time, prefer precise qualitative guidance over brittle prose duplication.

## Documentation Rules

- English only for runtime and business logic content.
- No provenance, migration, or legacy wording.
- No raw `*/` substrings inside doc comments.
- No placeholder rationale stubs.
- Documentation must explain why the layered model exists so future maintainers do not collapse the design into one brittle control point.

## Plan Authoring Rules

- HCOA task files must prefer self-contained references under `.plan/` over external absolute-path prompt files.
- If a plan task depends on this governance reference, it should point to this local file rather than to an external cheat sheet.
- Final validation must confirm the plan tree is structurally complete, architecturally consistent, and self-contained.

## Rollout Readiness Gates

The rollout is ready only if all of the following are represented and internally consistent:

- shared limit matrix
- shared error contract
- metadata-first preflight helpers
- runtime safety helpers where required
- family-specific handler budgets and refusal semantics
- global non-bypassable response fuse
- caller-visible contract harmonization
- rationale and TSDoc updates
- no-breaking-change fidelity
- no broad blacklist drift

## Prohibited Patterns

- schema-only protection for dynamic risk
- global fuse as the only guardrail
- broad regex blacklist as the primary safety model
- caller-overridable hard caps or bypass flags
- endpoint-local duplicated literals when shared canonical values exist
- parallel same-concept property surfaces without a documented semantic distinction

## Decision Standard for Plan Updates

When the plan and the inspected project disagree, the correction must prefer:

1. canonical shared ownership,
2. self-contained plan artifacts,
3. single-surface same-concept contracts,
4. metadata-first and budget-first enforcement placement,
5. truthful visible contract text.

Any required change that would introduce a new architectural branch rather than clarifying the selected target architecture must still stop for user direction.
