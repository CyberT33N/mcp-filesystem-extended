# Description: Filesystem MCP Server Workspace
[INTENT: CONTEXT]

---

## 1. Scope Overview
[INTENT: CONTEXT]

This workspace contains the TypeScript implementation of a secure filesystem MCP server.
The current architecture exposes one canonical structured directory-entry listing surface named `list_directory_entries`, keeps repository-wide tool registration in `src/server.ts`, and centralizes optional filesystem metadata in `src/file_infos/metadata.ts`.
The consolidated listing flow returns TOON by default, always includes the required `type` field for each entry, supports recursive traversal by default, and exposes optional metadata only when explicitly requested.

---

## 2. Information Register
[INTENT: REFERENCE]

| ID | Type | Description | Change | Status |
|----|------|-------------|--------|--------|
| REQ-001 | REQUIREMENT | Canonical directory-entry listing is exposed through `list_directory_entries`. | Yes | Active |
| REQ-002 | REQUIREMENT | `recursive=false` returns same-level files and directories only. | Yes | Active |
| REQ-003 | REQUIREMENT | Structured directory-entry responses are encoded in TOON by default. | Yes | Active |
| CONV-001 | CONSTRAINT | Entry metadata is centralized in `src/file_infos/metadata.ts`. | Yes | Active |
| CONV-002 | CONSTRAINT | Every listed entry must always include the required `type` field. | Yes | Active |
| INFO-001 | INFORMATION | The root server registry and package manifest align the consolidated tool surface and TOON dependency. | Yes | Active |

---

## 3. Information Units
[INTENT: SPECIFICATION]

### 3.1 REQ-001: Canonical Directory-Entry Listing Surface
[INTENT: SPECIFICATION]

**Type:** REQUIREMENT

**Description:**
The workspace exposes one canonical structured directory-entry listing surface through the MCP tool `list_directory_entries`.
This surface is the single source of truth for directory listing behavior and replaces parallel listing semantics inside the active codebase.

**Current State:**
The tool registration in `src/server.ts` binds `list_directory_entries` to a dedicated handler and schema under `src/list-directory-entries`.
The handler produces a structured payload with `roots`, `entries`, nested `children` when recursion is enabled, and a required `type` field on every returned entry.

**Target State:**
The workspace should continue to expose only one structured directory-entry listing surface for this responsibility, with parameterized traversal and formatting behavior instead of parallel endpoint families.

**Affected Files:**

| Path | Relevance | Elements |
|------|-----------|----------|
| `src/server.ts` | Root MCP tool registration and request dispatch | `ListToolsRequestSchema`, `CallToolRequestSchema`, `list_directory_entries` |
| `src/list-directory-entries/handler.ts` | Canonical directory-entry traversal and TOON encoding | `handleListDirectoryEntries`, `collectDirectoryEntries`, `ListedDirectoryEntry` |
| `src/list-directory-entries/schema.ts` | Canonical input contract for listing behavior | `ListDirectoryEntriesArgsSchema` |

**Positive Example(s):**
- A caller omits `recursive`, and the returned payload includes nested `children` beneath each requested root.
- A caller sets `recursive: false` for `.` and receives same-level files and directories, each with an explicit `type`.

**Negative Example(s):**
- A separate shallow listing tool and a separate tree tool model the same responsibility in parallel.
- A listing payload omits `type` and forces the caller to infer whether an entry is a file or directory.

---

### 3.2 REQ-002: Same-Level Semantics for `recursive=false`
[INTENT: SPECIFICATION]

**Type:** REQUIREMENT

**Description:**
When `recursive` is set to `false`, the listing result must include all files and all directories on the exact level of the requested root path.
It must not silently suppress directories in non-recursive mode.

**Current State:**
The consolidated handler models entries from the requested root path and distinguishes between recursive and same-level traversal through the `recursive` flag.
The required `type` field remains present in both modes.

**Target State:**
Non-recursive listing must remain level-accurate and must continue to return both files and directories for the requested root path.

**Affected Files:**

| Path | Relevance | Elements |
|------|-----------|----------|
| `src/list-directory-entries/handler.ts` | Traversal semantics for same-level vs recursive behavior | `collectDirectoryEntries`, `recursive` handling |
| `src/list-directory-entries/schema.ts` | Contract surface documenting the behavior | `recursive` |

**Positive Example(s):**
- `recursive: false` on `src` returns same-level directories such as `helpers` and `file_infos` together with same-level files such as `server.ts`.
- `recursive: false` never emits deeper descendants below the current level.

**Negative Example(s):**
- `recursive: false` returns files only and drops same-level directories.
- `recursive: false` still traverses into nested descendants below the requested root.

---

### 3.3 REQ-003: TOON as the Default Structured Listing Format
[INTENT: SPECIFICATION]

**Type:** REQUIREMENT

**Description:**
The canonical structured listing surface encodes its response payload using TOON instead of JSON.
The TOON representation is the default transport format for structured listing output.

**Current State:**
The handler imports `encode` from `@toon-format/toon` and encodes the structured `roots` payload into TOON before returning it to the MCP layer.
The package manifest declares the TOON dependency used by the handler.

**Target State:**
Structured directory-entry listing should continue to use TOON as its default encoded output while preserving a schema-aligned payload model.

**Affected Files:**

| Path | Relevance | Elements |
|------|-----------|----------|
| `src/list-directory-entries/handler.ts` | Default output encoding | `encode`, `ListDirectoryEntriesResult` |
| `package.json` | Dependency declaration for TOON support | `@toon-format/toon` |
| `package-lock.json` | Lockfile alignment for the installed TOON dependency | package lock state |

**Positive Example(s):**
- The handler returns a TOON-encoded structure rooted at `roots`, preserving nested entry relationships and optional metadata fields.
- The package manifest and lockfile both contain the TOON dependency required by the handler.

**Negative Example(s):**
- The handler serializes its structured listing payload as JSON while the contract declares TOON as the default output format.
- The runtime uses TOON-specific code without the matching dependency being declared in the package manifest.

---

### 3.4 CONV-001: Canonical Filesystem Metadata Surface
[INTENT: SPECIFICATION]

**Type:** CONSTRAINT

**Description:**
Optional listing metadata must originate from one canonical filesystem metadata surface.
This canonical metadata surface lives in `src/file_infos/metadata.ts` and is shared by the listing flow and the `get_file_infos` flow.

**Current State:**
`src/file_infos/metadata.ts` exposes canonical entry-type resolution and metadata extraction.
`src/file_infos/handler.ts` consumes that metadata surface instead of duplicating `fs.stat` mapping logic inside the formatting flow.

**Target State:**
Any future filesystem listing or metadata feature should consume the canonical metadata surface instead of re-implementing stat-to-field mapping locally.

**Affected Files:**

| Path | Relevance | Elements |
|------|-----------|----------|
| `src/file_infos/metadata.ts` | Canonical metadata source | `FileSystemEntryMetadata`, `getFileSystemEntryMetadata` |
| `src/file_infos/handler.ts` | Existing metadata endpoint aligned to the canonical source | `getFormattedFileInfo` |
| `src/list-directory-entries/handler.ts` | Optional metadata consumer | `includeMetadata`, `applyOptionalMetadata` |

**Positive Example(s):**
- `includeMetadata: true` on the listing tool adds `size`, `created`, `modified`, `accessed`, and `permissions` from the canonical metadata surface.
- `get_file_infos` formats metadata from the same canonical source rather than duplicating stat-shape mapping.

**Negative Example(s):**
- The listing handler introduces a second local `fs.stat` mapping surface with different field names or formatting rules.
- One endpoint renders permissions or timestamps differently than another endpoint for the same filesystem entry data.

---

### 3.5 CONV-002: Required Type and Optional Metadata Discipline
[INTENT: SPECIFICATION]

**Type:** CONSTRAINT

**Description:**
Each listed entry must always expose `type` as a required field.
Additional metadata fields are optional and are enabled only through the explicit metadata flag.

**Current State:**
The listing schema sets `includeMetadata` to `false` by default.
The handler always resolves and returns `type`, while additional metadata fields are populated only when metadata inclusion is enabled.

**Target State:**
The required/optional distinction must remain stable: `type` is mandatory, and the remaining metadata fields remain explicitly opt-in.

**Affected Files:**

| Path | Relevance | Elements |
|------|-----------|----------|
| `src/list-directory-entries/schema.ts` | Canonical contract for metadata inclusion | `includeMetadata` |
| `src/list-directory-entries/handler.ts` | Required entry type and optional metadata population | `type`, `size`, `created`, `modified`, `accessed`, `permissions` |
| `src/file_infos/metadata.ts` | Canonical optional metadata fields | `FileSystemEntryMetadata` |

**Positive Example(s):**
- A listing entry contains `type: directory` even when `includeMetadata` is omitted.
- A listing entry contains `type`, `size`, `created`, `modified`, `accessed`, and `permissions` when `includeMetadata: true` is set.

**Negative Example(s):**
- `type` is hidden behind the metadata flag.
- Metadata fields appear by default without the caller explicitly opting in.

---

### 3.6 INFO-001: Root Registry and Workspace Alignment
[INTENT: SPECIFICATION]

**Type:** INFORMATION

**Description:**
The workspace root remains the canonical registration and dependency surface for the MCP filesystem server.
The consolidated tool integration is coordinated from the root server registry and the root package manifest.

**Current State:**
`src/server.ts` contains the MCP tool registration and request dispatch logic.
The root `package.json` and `package-lock.json` align the runtime dependency set for the structured listing flow.

**Target State:**
The workspace root should continue to carry registry and dependency ownership for the server-level tool surface while feature implementations remain inside dedicated `src/<tool>` areas.

**Affected Files:**

| Path | Relevance | Elements |
|------|-----------|----------|
| `src/server.ts` | Root MCP registry and handler dispatch | `setupRequestHandlers` |
| `package.json` | Runtime dependency surface | dependencies |
| `package-lock.json` | Lockfile alignment | resolved dependency graph |

---

## 4. Conventions and Constraints
[INTENT: CONSTRAINT]

- The workspace root is the confirmed metadata scope for this change set.
- The canonical directory-entry listing surface is `list_directory_entries`.
- TOON is the default transport format for structured listing output.
- `recursive` defaults to `true`.
- `recursive=false` must return same-level files and same-level directories only.
- `type` is always required for each listed entry.
- `includeMetadata` defaults to `false`.
- Optional metadata fields are sourced from `src/file_infos/metadata.ts`.
- Repository-level MCP tool registration remains centralized in `src/server.ts`.

---

## 5. Path Index
[INTENT: REFERENCE]

| # | Path | Relevance | Unit IDs |
|---|------|-----------|----------|
| 1 | `src/server.ts` | Root MCP tool registration and dispatch | REQ-001, INFO-001 |
| 2 | `src/list-directory-entries/handler.ts` | Canonical structured listing and TOON encoding | REQ-001, REQ-002, REQ-003, CONV-002 |
| 3 | `src/list-directory-entries/schema.ts` | Canonical contract for traversal and metadata flags | REQ-001, REQ-002, CONV-002 |
| 4 | `src/file_infos/metadata.ts` | Canonical metadata single source of truth | CONV-001, CONV-002 |
| 5 | `src/file_infos/handler.ts` | Metadata endpoint aligned to the canonical metadata source | CONV-001 |
| 6 | `package.json` | TOON dependency declaration | REQ-003, INFO-001 |
| 7 | `package-lock.json` | Lockfile alignment for dependency changes | REQ-003, INFO-001 |

---

## 6. Execution Context for LLM Agents
[INTENT: CONTEXT]

This workspace is a TypeScript MCP filesystem server with one root registration surface in `src/server.ts` and per-tool implementation areas under `src`.
For the current architecture, treat `list_directory_entries` as the only canonical structured directory-entry listing surface.
Use `src/file_infos/metadata.ts` as the single source of truth for optional filesystem metadata.
Assume TOON is the default structured output format for the consolidated listing payload.
When working on directory-entry behavior, preserve these invariants:

- `recursive` defaults to `true`
- `recursive=false` returns same-level files and directories only
- `type` is always required
- additional metadata fields remain opt-in through `includeMetadata`

Do not reintroduce parallel shallow-list and tree-list endpoint families for the same responsibility.
