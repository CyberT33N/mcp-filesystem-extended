# Structured Content Contract

> **Context:** See [`CONVENTIONS.md`](../../CONVENTIONS.md) for the full conventions index and core invariants.
> **Related:** [`conventions/guardrails/overview.md`](../guardrails/overview.md) for size-cap governance and the global response fuse.

---

## Core Invariant — `content.text` Is the Primary Information Carrier

Every MCP tool response from this server **must** carry complete, authoritative caller-visible information inside `content.text`. This is a non-negotiable architectural invariant.

`structuredContent` is additive-only. It carries the same core information as `content.text`, structured as a typed JSON object, and exists exclusively to enable machine consumers to access fields without text parsing. It **never** acts as the primary or sole information carrier for any output that a caller would need to reason about the result.

---

## Why This Invariant Exists

The MCP SDK types declare `structuredContent` as `ZodOptional`:

```typescript
export declare const CallToolResultSchema: z.ZodObject<{
  content: z.ZodDefault<z.ZodArray<...>>;            // always present
  structuredContent: z.ZodOptional<z.ZodRecord<...>>; // optional — may be absent or ignored
  isError: z.ZodOptional<z.ZodBoolean>;
}>
```

**This server cannot know which MCP client environment will consume its responses.** Any of the following are valid MCP consumers:

- Environments that expose only `content.text` to the active LLM context (e.g. many agent orchestrators, IDE integrations)
- Environments that expose both `content.text` and `structuredContent` as separate accessible surfaces
- Environments that drop `structuredContent` entirely and treat only `content.text` as the response payload

If `content.text` does not carry the complete result, callers in environments that cannot access `structuredContent` receive incomplete or misleading information. This is an architectural dependency on a surface the server cannot guarantee will be consumed — and that dependency must not be introduced.

---

## The Allowed Role of `structuredContent`

`structuredContent` **must** satisfy exactly one of the following:

1. **Structural bonus only:** It carries the same information as `content.text`, structured as a typed JSON object so that machine consumers can access fields without text parsing. The underlying data is identical — no divergence is allowed.
2. **Protocol metadata only:** It carries envelope metadata such as `admission` and `resume` fields that describe session state and delivery mode, not primary result content.

`structuredContent` **must not** satisfy either of the following:

- Carrying match data, directory entries, path lists, counts, or any other primary result content that is absent from `content.text`
- Acting as the authoritative data surface while `content.text` carries only a compact summary or progress notice

---

## Prohibition: `content.text` Summary Degradation

In resumable preview or completion-backed delivery modes, it is **forbidden** to degrade `content.text` to a compact summary while placing the actual result payload exclusively in `structuredContent.roots` or equivalent fields.

**Forbidden pattern:**

```
content.text:       "8 matches found in this bounded chunk."   ← incomplete
structuredContent:  { roots: [ { matches: [...] } ] }          ← primary data carrier
```

**Required pattern:**

```
content.text:       "Found 8 matches in 8 locations\n\nFile: ...\n  Line 1: ...\n\nActive resumeToken: ..."
structuredContent:  { roots: [ { matches: [...] } ], admission: {...}, resume: {...} }
```

The full match data, directory entries, path list, or other primary result content must appear in `content.text`. The continuation guidance — including `resumeToken`, supported resume modes, guidance text, and scope-reduction text — may be appended to `content.text` after the primary data. `structuredContent` mirrors the same data in structured form.

---

## Single Source of Truth and Drift Prevention

Because `content.text` and `structuredContent` both carry the primary result data, a single source of truth for that data **must** be maintained inside the domain layer. The text formatter and the structured result surface must consume the same underlying result objects.

Allowing `content.text` and `structuredContent` to derive from separate code paths would introduce drift risk: a change to one surface could silently leave the other stale. Both surfaces must be built from the same structured result domain objects.

---

## Continuation Guidance Placement

When a response is resumable, continuation guidance must appear inside `content.text` **after** the primary result data, not instead of it. The continuation block must include:

- The active `resumeToken`
- The supported resume modes
- The delivery guidance text (from `admission.guidanceText` or the endpoint's fallback)
- The structured-payload reference note (`INSPECTION_RESUME_STRUCTURED_PAYLOAD_GUIDANCE`)
- The scope-reduction guidance (from `admission.scopeReductionGuidanceText` when present)

`structuredContent.admission` and `structuredContent.resume` remain the authoritative machine-readable envelope for session state, because those are protocol metadata surfaces — not primary result content. This distinction is intentional and correct: envelope metadata belongs in `structuredContent`, primary result data belongs in both.

---

## Summary Table

| Surface | Primary result data | Continuation guidance | Protocol envelope metadata |
|---|---|---|---|
| `content.text` | **Required — always complete** | Required — appended after data | Not applicable |
| `structuredContent` | Required — mirrors `content.text` data | Not applicable | Required — `admission` and `resume` fields |

---

## Enforcement Scope

This invariant applies to all tool handlers in this server that return result data to callers:

- All inspection endpoints returning match locations, directory entries, path lists, or count results
- All search endpoints in any delivery mode (inline, next-chunk, complete-result)
- All discovery endpoints in any delivery mode

The invariant does **not** apply to guardrail refusal responses (`isError: true`), which are already small and are not subject to content completeness requirements.
