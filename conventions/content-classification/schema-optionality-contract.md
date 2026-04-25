# Schema Optionality Contract for Pattern and Query Fields

> **Context:** See [`CONVENTIONS.md`](../../CONVENTIONS.md) for the full conventions index and core invariants.
> **Overview:** [`conventions/content-classification/overview.md`](./overview.md) for the full classifier architecture.
> **Related:** [`conventions/guardrails/overview.md`](../guardrails/overview.md) for guardrail layers.
> **Resume endpoint schemas:** [`conventions/resume-architecture/endpoint-schema-contract.md`](../resume-architecture/endpoint-schema-contract.md) for the full resume-endpoint flat-schema pattern, factory functions, and complete affected-endpoint list.

---

## The Rule

**Optional string query fields that represent absence must use `.optional()` without a `.default()` value.**

This applies to every field in any endpoint schema where `undefined` is the correct domain representation for "the caller did not provide this value". Pattern fields, regex fields, and query string fields fall under this rule.

---

## Why `.optional().default("")` Is an Anti-Pattern

### The Contract Mismatch

Zod's `.optional().default("")` produces a field that is optional in the public API surface but always present in the parsed output as an empty string. This creates a contract mismatch:

- The **public type** communicates optionality: callers may omit the field.
- The **parsed output type** communicates a `string`, never `undefined`.
- The **domain consumer** receives `""` and must distinguish it from a real empty pattern.

The result is that the domain layer must implement sentinel-value checks (`if (pattern === "")`) to recover the information that was lost at the schema boundary — the fact that the field was absent.

### The Downstream Failure Mode

The content-classification policy in [`resolveCountQueryPolicy()`](../../src/domain/shared/search/count-query-policy.ts) checks:

```ts
if (input.pattern === undefined) {
  // total-only lane
} else {
  // pattern-aware lane
}
```

When `regex` reaches the handler as `""` instead of `undefined`, this check fails silently. The handler enters the pattern-aware lane, the classifier then finds the file is `HYBRID_SEARCHABLE`, and correctly rejects the pattern-aware lane — but the rejection is semantically wrong because no pattern was supplied by the caller. The root cause is the schema default, not the policy.

---

## Correct Modeling

### Optional query field — no default:

```ts
// Correct: undefined = caller did not provide a pattern
regex: z
  .string()
  .max(REGEX_PATTERN_MAX_CHARS)
  .optional()
  .describe("Regular expression applied to counted lines. Omit when total-only counting is required.")
```

The parsed output type is `string | undefined`. `undefined` means "no pattern". The domain consumer receives the correct absent signal without any sentinel translation.

### Corresponding superRefine check:

```ts
// Correct: undefined check — no sentinel logic required
const hasQueryDefiningFields =
  args.paths.length > 0
  || args.recursive
  || args.regex !== undefined   // ← not: args.regex !== ""
  || args.includeGlobs.length > 0
  // ...
```

---

## When `.default()` Is Correct on Optional Fields

`.default()` is architecturally valid only when the default value is semantically equivalent to the field being absent. Boolean and array fields commonly meet this criterion:

| Field | Default | Rationale |
|---|---|---|
| `recursive: z.boolean().optional().default(false)` | `false` | Non-recursive is the correct behavior when the caller omits the field. No downstream consumer needs to distinguish `false` from absent. |
| `paths: z.array(...).optional().default([])` | `[]` | Empty array is the correct input when the caller provides no paths. The handler treats it the same as omission. |
| `includeGlobs: z.array(...).optional().default([])` | `[]` | Same as above. |
| `ignoreEmptyLines: z.boolean().optional().default(false)` | `false` | Counting all lines is the correct default behavior. |

The distinguishing question: **Is the default value semantically different from the absent case in any downstream consumer?**

- For `false` and `[]`: No. Downstream logic handles them identically.
- For `""` on a regex field: Yes. `""` vs `undefined` activates different execution lanes in the policy layer.

---

## Detection Heuristic

Any `superRefine` or handler code that checks `field !== ""` (or `field.length > 0` on a string default) to determine whether a field was "really" supplied is a **sentinel-check code smell**. It indicates that a `.default("")` was applied to a field where `undefined` is the intended absent signal.

Correct code uses `field !== undefined` to distinguish absent from present.

---

## Affected Endpoints and Fields

### `count_lines`

| Field | Correct type after schema parse | Default | Notes |
|---|---|---|---|
| `regex` | `string \| undefined` | None | Fixed in this revision. `.default("")` removed. |
| `paths` | `string[]` | `[]` | Correct. Empty array is a valid absent-paths representation. |
| `recursive` | `boolean` | `false` | Correct. |
| `includeGlobs` | `string[]` | `[]` | Correct. |
| `excludeGlobs` | `string[]` | `[]` | Correct. |
| `includeExcludedGlobs` | `string[]` | `[]` | Correct. |
| `respectGitIgnore` | `boolean` | `false` | Correct. |
| `ignoreEmptyLines` | `boolean` | `false` | Correct. |

### Audit Scope for Other Endpoints

Before adding a `.default("")` to any string field on any endpoint schema, verify:

1. Is `undefined` the correct domain signal for absence of this field?
2. Does any downstream consumer branch on this field being absent versus empty string?
3. Would a sentinel check (`!== ""`) be needed anywhere downstream?

If the answer to (1) or (2) is yes, or (3) is yes: use `.optional()` without a default.

---

## Source References

| Artifact | File |
|---|---|
| `CountLinesArgsSchema` | [`src/domain/inspection/count-lines/schema.ts`](../../src/domain/inspection/count-lines/schema.ts) |
| `resolveCountQueryPolicy()` | [`src/domain/shared/search/count-query-policy.ts`](../../src/domain/shared/search/count-query-policy.ts) |
| `classifyInspectionContentState()` | [`src/domain/shared/search/inspection-content-state.ts`](../../src/domain/shared/search/inspection-content-state.ts) |
