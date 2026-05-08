# Conventions: `create_directories`
[INTENT: CONSTRAINT]

---

## 1. Local SSOT Role
[INTENT: CONTEXT]

This file is the endpoint-local single source of truth for the `create_directories` conventions and guardrails.

It owns the rules for:

- directory-only semantics,
- path validation before creation,
- idempotent recursive directory creation,
- batch-size and path-scope guardrails,
- family-boundary distinctions from file creation, copy, and move operations.

The endpoint-local architecture description lives in [`DESCRIPTION.md`](./DESCRIPTION.md), and the concise developer-facing summary lives in [`README.md`](./README.md).

This endpoint also follows the global public-limit-disclosure policy in [`public-limit-disclosure-governance.md`](../../../../conventions/guardrails/public-limit-disclosure-governance.md).

---

## 2. Canonical Request Surface
[INTENT: REFERENCE]

| Surface | Rule |
| --- | --- |
| Tool name | `create_directories` |
| Batch container | `paths[]` |
| Path scope | Directory paths only |
| Parent creation behavior | Recursive parent creation is part of the endpoint |

### Canonical same-concept rule
[INTENT: CONSTRAINT]

The endpoint accepts directory paths, not file content payloads and not source-to-destination operation pairs.

Do not reframe the request surface as:

- `files[]`,
- `operations[]`,
- source/destination path movement,
- file creation with content.

---

## 3. Directory-Creation Semantics
[INTENT: CONSTRAINT]

### 3.1 Directory-only scope

`create_directories` is dedicated to directory creation only.

It must not be documented as:

- text file creation,
- copy behavior,
- move or rename behavior.

### 3.2 Recursive parent creation

The runtime creates the requested directory path with recursive parent creation enabled.

This means the endpoint can materialize missing parent directories as part of the same request instead of requiring manual pre-creation of every ancestor.

### 3.3 Idempotent behavior

The endpoint uses idempotent recursive directory semantics.

If a requested directory already exists, the runtime does not need a second destructive path-mutation mode to keep the request valid.

### 3.4 Path validation

Every requested path is validated for safe creation inside the allowed-directory scope before the filesystem mutation begins.

---

## 3A. Public Limit Disclosure Placement
[INTENT: CONSTRAINT]

`create_directories` belongs to the mutation family and follows the global public-limit-disclosure policy with a request-shape-first emphasis.

### 3A.1 Parameter-description disclosure (required)

Stable request-shape limits belong in the schema-owned parameter descriptions because callers need them while constructing the directory-creation request.

For `create_directories`, that includes:

- path-length limits via `PATH_MAX_CHARS`
- path-count and batch breadth via `MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST`

The endpoint-local rule is therefore:

> Request-shape limits must be disclosed in [`schema.ts`](./schema.ts) through constant-backed parameter descriptions.

### 3A.2 Tool-description disclosure (selective)

Stable operation-wide delivery rules may appear in the runtime tool description, but this family prioritizes concise request-shape communication over aggressive numeric tool-description disclosure.

For `create_directories`, the important runtime rule is that:

- successful output remains a concise path-mutation summary
- oversized path batches are refused rather than widened into broader mutation behavior

### 3A.3 Non-prioritized internal limits (required non-disclosure rationale)

This endpoint must not promote the following internal or broader server-owned limits into its routine public tool description as if they were the primary caller target:

- the exact global fuse as the dominant optimization number
- internal directory-creation implementation mechanics
- server-internal emergency/runtime guardrails

Those surfaces remain owned by shared architecture conventions because they are server-internal protection mechanics rather than the primary caller-actionable contract.

---

## 4. Guardrails and Budgets
[INTENT: CONSTRAINT]

| Surface | Limit | Meaning |
| --- | --- | --- |
| Paths per request | `200` | Maximum number of directory paths in one mutation batch |
| Path length | `4096` characters | Maximum length for one path string |

### Refusal model

The primary protection surface is path-mutation blast-radius control.

The endpoint refuses or fails early when:

- the mutation batch exceeds the allowed path-operation count,
- a requested path fails creation-time path validation,
- filesystem creation fails for an individual target.

This is a path-mutation endpoint, so its primary guardrail model is bounded batch size plus validated path scope rather than content-size shaping.

---

## 5. Result Surface
[INTENT: SPECIFICATION]

The runtime returns a deterministic batch summary rather than a content-bearing preview surface.

The summary reports:

- how many directories were created successfully,
- whether any directory creation failed,
- file-system-level error messages when failures occur.

This endpoint does not produce diff-style output because its mutation surface is path-oriented rather than content-oriented.

---

## 6. Boundary Rules
[INTENT: CONSTRAINT]

### 6.1 Distinction from `create_files`

`create_files` owns additive creation of new text files with caller-supplied content.

`create_directories` instead owns directory-path creation only.

### 6.2 Distinction from `copy_paths`

`copy_paths` owns source-to-destination duplication.

It already creates missing destination parent directories internally, so callers do not need `create_directories` as a prerequisite when copy is the real objective.

### 6.3 Distinction from `move_paths`

`move_paths` owns source-to-destination relocation or rename behavior.

It also creates missing destination parent directories internally, so callers do not need `create_directories` as a prerequisite when move is the real objective.

---

## 7. Practical Use Guidance
[INTENT: CONSTRAINT]

Use this endpoint when the caller needs one or more directories to exist as directories.

Choose another mutation surface when the real operation is:

- creating files with content,
- copying a filesystem item,
- moving or renaming a filesystem item,
- mutating file contents.
