# Resume-Architecture Endpoint Schema Contract

> **Context:** See [`CONVENTIONS.md`](../../CONVENTIONS.md) for the full conventions index and core invariants.  
> **Overview:** [`conventions/resume-architecture/overview.md`](./overview.md) for the resume-session model, delivery modes, endpoint families, and scope reduction.  
> **Related:** [`conventions/content-classification/schema-optionality-contract.md`](../content-classification/schema-optionality-contract.md) for the optionality and sentinel-check rules for query fields.

---

## Purpose

This document defines the canonical Zod schema construction contract for all endpoints that participate in the resume architecture. It explains the MCP SDK constraint that forces a specific schema pattern, the correct field optionality approach, the sentinel-check discipline, and the shared field-builder convention that removes cross-endpoint description duplication.

This document is authoritative for LLM agents that generate, modify, or review endpoint schemas in this codebase.

---

## MCP SDK Constraint: Why `z.discriminatedUnion` Cannot Be Used as `inputSchema`

### The Problem

The MCP SDK serializes `z.discriminatedUnion` and `z.union` into a JSON Schema `anyOf` surface at the `inputSchema` level. The resulting JSON Schema does **not** contain a top-level `properties` block.

MCP clients discover tool parameters exclusively through `inputSchema.properties`. When `inputSchema` resolves to an `anyOf` shape instead of a flat object, clients receive **no visible parameters**.

This behavior is intrinsic to how the MCP SDK transforms Zod schemas into JSON Schema for the `tools/list` response. It is not a version-specific bug; it is a structural consequence of how `anyOf`/`oneOf` are modeled in JSON Schema versus flat `object` with `properties`.

**Verified in:** [`node_modules/@modelcontextprotocol/sdk/dist/cjs/server/mcp.d.ts`](../../node_modules/@modelcontextprotocol/sdk/dist/cjs/server/mcp.d.ts) — `registerTool` accepts `inputSchema` as `ZodRawShapeCompat | AnySchema`, and the SDK normalizes object schemas before parameter extraction.

### Why This Matters for Resume Endpoints

Each resume-capable endpoint serves two semantically distinct request modes:

| Mode | Description |
|---|---|
| **Base request** | Initiates a new traversal or search. Requires query-defining fields (`roots`, `glob`, `regex`, `nameContains`, `fixedString`, `paths`). `resumeToken` is absent. |
| **Resume request** | Continues a persisted server-owned session. Requires `resumeToken` + `resumeMode`. Query-defining fields must be absent. |

The architecturally correct schema for these two modes would be a `z.discriminatedUnion` or `z.union`:

```ts
// Architecturally correct — but CANNOT be used as MCP inputSchema
const Correct = z.union([
  BaseRequestSchema,    // roots required, resumeToken absent
  ResumeRequestSchema,  // resumeToken required, roots absent
]);
```

Because this schema produces `anyOf` in JSON Schema without a `properties` block, MCP clients see no parameters at all. This is a hard constraint imposed by the SDK.

---

## The Required Solution: Flat `z.object()` + `superRefine`

### The Pattern

Every resume-capable endpoint schema **must** be structured as a single flat `z.object()` where:

1. All query-defining fields are declared `.optional()` **without** a `.default()` value when `undefined` is the correct domain signal for absence.
2. Array-type and boolean-type fields with semantically equivalent defaults (empty array, `false`) **may** carry `.default([])` and `.default(false)` respectively.
3. `resumeToken` is declared `.optional()` (absent = base request; present = resume request).
4. `resumeMode` is declared `.optional()` (required at runtime only when `resumeToken` is present — enforced by `superRefine`, not by the schema type).
5. A `superRefine` block enforces the cross-field invariants that cannot be expressed in a flat JSON Schema.

```ts
// Correct — produces visible properties in MCP clients
export const EndpointArgsSchema = z.object({
  resumeToken: InspectionResumeTokenFieldSchema("family-description"),
  resumeMode: InspectionResumeModeFieldSchema,
  roots: z.array(z.string().max(PATH_MAX_CHARS)).max(MAX_ROOTS).optional().default([]).describe("..."),
  queryField: z.string().max(MAX_CHARS).optional().describe("..."),  // NO .default("")
  // ...boolean and array fields with defaults...
}).superRefine((args, ctx) => {
  const resumeRequest = args.resumeToken !== undefined;
  const hasQueryDefiningFields =
    args.roots.length > 0
    || args.queryField !== undefined   // sentinel: !== undefined, NOT !== ""
    // ...

  if (!resumeRequest && args.roots.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Base requests must provide at least one root.", path: ["roots"] });
  }

  if (!resumeRequest && args.queryField === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Base requests must provide a queryField.", path: ["queryField"] });
  }

  applyCommonResumeSchemaRefinement(args, ctx, hasQueryDefiningFields);
});
```

### What `superRefine` Enforces

The shared `applyCommonResumeSchemaRefinement` helper (from [`src/domain/shared/resume/inspection-resume-contract.ts`](../../src/domain/shared/resume/inspection-resume-contract.ts)) enforces three cross-field invariants that are identical across all endpoint families:

| Invariant | Rule |
|---|---|
| `resumeMode` without `resumeToken` | Rejected: base requests must not provide `resumeMode`. |
| `resumeToken` without `resumeMode` | Rejected: resume requests must provide `resumeMode`. |
| Query-defining fields on resume request | Rejected: resume requests must omit query-defining fields. |

Each endpoint schema adds its own endpoint-specific checks on top of these shared invariants:

- Base request must provide at least one `roots` entry.
- Base request must provide the required query field (`glob`, `nameContains`, `regex`, `fixedString`).

---

## Sentinel-Check Discipline for Optional String Query Fields

This section summarizes the rule from [`conventions/content-classification/schema-optionality-contract.md`](../content-classification/schema-optionality-contract.md) as it applies specifically to resume endpoint query fields.

### The Rule

**String query fields that gate execution-lane selection or are required on base requests must use `.optional()` without `.default("")`.**

### Why `.default("")` Is Wrong for Query Fields

When `.default("")` is applied:

- The parsed output type is `string`, never `undefined`.
- The `superRefine` sentinel check must use `!== ""` to detect absence.
- `undefined !== ""` evaluates to `true`, which means an absent field on a resume request is misidentified as a present query-defining field.
- Resume requests that correctly omit the query field will fail with: *"Resume-only requests must omit new query-defining fields."*

When `.optional()` is used without `.default()`:

- The parsed output type is `string | undefined`.
- `undefined` is the unambiguous domain signal for absence.
- The `superRefine` sentinel check uses `!== undefined`, which is correct and unambiguous.

### Correct Pattern

```ts
// Correct: undefined = field was not provided
queryField: z.string().max(MAX_CHARS).optional().describe("..."),

// Corresponding superRefine check:
const hasQueryDefiningFields =
  ...
  || args.queryField !== undefined   // ← correct
  ...

if (!resumeRequest && args.queryField === undefined) {  // ← correct
  ctx.addIssue({ ... });
}
```

### Incorrect Pattern (Do Not Use)

```ts
// Wrong: "" is an ambiguous absent-signal and forces sentinel-check smell
queryField: z.string().max(MAX_CHARS).optional().default("").describe("..."),

// Corresponding superRefine check (code smell):
const hasQueryDefiningFields =
  ...
  || args.queryField !== ""   // ← sentinel smell
  ...

if (!resumeRequest && args.queryField === "") {  // ← sentinel smell
  ctx.addIssue({ ... });
}
```

### When `.default()` Is Correct

| Type | Default | Rationale |
|---|---|---|
| `boolean` | `false` | Non-recursive, case-insensitive, ignore-gitignore-off are all correct absent defaults. |
| `string[]` | `[]` | Empty array is semantically equivalent to absent for all array query fields. |
| `number` (caps) | e.g. `100` | A default result cap is semantically correct behavior when omitted. |

---

## Shared Field-Builder Functions

To prevent description drift across the six resume-capable endpoint schemas, the shared `resumeToken` and `resumeMode` field schemas are exported from [`src/domain/shared/resume/inspection-resume-contract.ts`](../../src/domain/shared/resume/inspection-resume-contract.ts) as reusable builder functions.

### `InspectionResumeTokenFieldSchema(familyLabel)`

Returns the `resumeToken` Zod field schema with the correct description for the given endpoint family.

```ts
// Usage in endpoint schema:
[INSPECTION_RESUME_TOKEN_FIELD]: InspectionResumeTokenFieldSchema("name-discovery"),
```

Produces description: *"Opaque resume token returned by a prior same-endpoint name-discovery response. When provided, the request must omit new query-defining fields and the server reloads the persisted request context."*

### `InspectionResumeModeFieldSchema`

Returns the `resumeMode` Zod field schema for preview-capable families (supports both `next-chunk` and `complete-result`).

### `InspectionCompletionOnlyResumeModeFieldSchema`

Returns the `resumeMode` Zod field schema for completion-backed-only families (supports only `complete-result`). Used exclusively by `count_lines`.

---

## Affected Endpoints

The following endpoints participate in the resume architecture. All of them use the flat `z.object()` + `superRefine` pattern described in this document.

### Preview-Capable Families

These endpoints support both `resumeMode = 'next-chunk'` and `resumeMode = 'complete-result'`.

| Endpoint | Schema file | Query field governed by this contract |
|---|---|---|
| `list_directory_entries` | [`src/domain/inspection/list-directory-entries/schema.ts`](../../src/domain/inspection/list-directory-entries/schema.ts) | `roots` (array, `.default([])` is correct — empty array = absent) |
| `find_paths_by_name` | [`src/domain/inspection/find-paths-by-name/schema.ts`](../../src/domain/inspection/find-paths-by-name/schema.ts) | `nameContains` (string, no default — `undefined` = absent) |
| `find_files_by_glob` | [`src/domain/inspection/find-files-by-glob/schema.ts`](../../src/domain/inspection/find-files-by-glob/schema.ts) | `glob` (string, no default — `undefined` = absent) |
| `search_file_contents_by_regex` | [`src/domain/inspection/search-file-contents-by-regex/schema.ts`](../../src/domain/inspection/search-file-contents-by-regex/schema.ts) | `regex` (string, no default — `undefined` = absent) |
| `search_file_contents_by_fixed_string` | [`src/domain/inspection/search-file-contents-by-fixed-string/schema.ts`](../../src/domain/inspection/search-file-contents-by-fixed-string/schema.ts) | `fixedString` (string, no default — `undefined` = absent) |

### Completion-Backed-Only Family

This endpoint supports only `resumeMode = 'complete-result'`.

| Endpoint | Schema file | Query field governed by this contract |
|---|---|---|
| `count_lines` | [`src/domain/inspection/count-lines/schema.ts`](../../src/domain/inspection/count-lines/schema.ts) | `regex` (string, no default — `undefined` = absent, activates pattern-aware lane) |

**Note:** `count_lines.regex` was the first field migrated from `.default("")` to `.optional()` (without default). The fix and its rationale are documented in [`conventions/content-classification/schema-optionality-contract.md`](../content-classification/schema-optionality-contract.md). All other string query fields in this table must follow the same pattern.

---

## Parameter Descriptions: Communicating Required Semantics to MCP Clients

Because JSON Schema cannot express conditional required semantics for the flat-schema pattern, the `.describe()` text of each query field **must** communicate the base-request requirement to MCP clients and LLM agents.

### Required Description Pattern for String Query Fields

```ts
queryField: z.string().max(MAX_CHARS).optional().describe(
  "**Required for base requests.** <Field-specific description>. " +
  "Base requests provide this field for the initial <operation>; " +
  "resume-only requests omit it and reload the persisted request context."
),
```

### Required Description Pattern for `resumeToken`

```ts
resumeToken: z.string().min(1).optional().describe(
  "Opaque resume token returned by a prior same-endpoint <family-label> response. " +
  "When provided, the request must omit new query-defining fields and the server " +
  "reloads the persisted request context."
),
```

### Required Description Pattern for `resumeMode`

```ts
resumeMode: z.enum([...]).optional().describe(
  "Resume intent for a persisted same-endpoint <family-label> session. " +
  "Resume-only requests must provide either `next-chunk` or `complete-result`."
),
```

---

## Invariant Summary

| Invariant | Enforcement location |
|---|---|
| Query string fields use `.optional()` without `.default("")` | Schema field declaration |
| Sentinel checks use `!== undefined` not `!== ""` | `superRefine` `hasQueryDefiningFields` |
| Required-on-base checks use `=== undefined` not `=== ""` | `superRefine` per-field validation |
| `resumeMode` required on resume requests | `applyCommonResumeSchemaRefinement` |
| `resumeMode` forbidden without `resumeToken` | `applyCommonResumeSchemaRefinement` |
| Query-defining fields forbidden on resume requests | `applyCommonResumeSchemaRefinement` |
| Base requests must provide at least one `roots` entry | Per-schema `superRefine` |
| Base requests must provide required string query field | Per-schema `superRefine` |
| `resumeToken`/`resumeMode` field builders used from shared contract | Field declaration via `InspectionResumeTokenFieldSchema` / `InspectionResumeModeFieldSchema` |
