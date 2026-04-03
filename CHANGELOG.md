# Changelog: Filesystem MCP Server Workspace
[INTENT: REFERENCE]

---

## 1. Scope Metadata
[INTENT: CONTEXT]

| Field | Value |
|-------|-------|
| Scope Root | `.` |
| Versioning Standard | `Semantic Versioning 2.0.0` |
| Current Version | `1.0.0` |
| Semver Class | `major` |
| Breaking Change | `yes` |
| Commit Scope | `filesystem-server` |
| Current HEAD Commit Hash | `30a55a921cfd0e92857c5978cb72bf681a821ca5` |

---

## 2. Version Ledger
[INTENT: REFERENCE]

| Version | Date | Class | Breaking | Commit Type | HEAD Commit Hash | Summary | Commit Subject |
|---------|------|-------|----------|-------------|------------------|---------|----------------|
| `1.0.0` | `2026-04-03` | `major` | `yes` | `feat` | `30a55a921cfd0e92857c5978cb72bf681a821ca5` | `Consolidate legacy directory listing tools into the canonical TOON-based list_directory_entries surface.` | `feat(filesystem-server)!: consolidate directory listing into list_directory_entries` |

---

## 3. Current Version Entry
[INTENT: SPECIFICATION]

### 3.1 Version `1.0.0`
[INTENT: SPECIFICATION]

**Classification**

| Field | Value |
|-------|-------|
| Semver Class | `major` |
| Breaking Change | `yes` |
| Rationale | `The workspace replaces the previous split between list_directories and directory_trees with one canonical tool named list_directory_entries, changes the default structured response format to TOON, removes legacy tool source areas, and changes the consumer contract for directory-listing behavior.` |

**Change Units**

| ID | Category | Breaking | Summary | Affected Files | Description Alignment |
|----|----------|----------|---------|----------------|----------------------|
| CHG-001 | `contract` | `yes` | `Replace the legacy list_directories and directory_trees tool surfaces with the canonical list_directory_entries tool.` | `src/server.ts`, `src/list-directory-entries/handler.ts`, `src/list-directory-entries/schema.ts`, `src/list_directories/handler.ts`, `src/list_directories/schema.ts`, `src/directory_trees/handler.ts`, `src/directory_trees/helpers.ts`, `src/directory_trees/schema.ts` | `DESCRIPTION.md` documents the canonical directory-entry listing surface and the removal of parallel legacy responsibilities. |
| CHG-002 | `schema` | `yes` | `Define recursive traversal as the default and require same-level files and directories together when recursive is false.` | `src/list-directory-entries/handler.ts`, `src/list-directory-entries/schema.ts` | `DESCRIPTION.md` records the same-level traversal rule and the recursive default as active requirements. |
| CHG-003 | `contract` | `yes` | `Switch the default structured listing response from JSON or line-oriented text to TOON.` | `src/list-directory-entries/handler.ts`, `package.json`, `package-lock.json` | `DESCRIPTION.md` records TOON as the default structured transport for the canonical listing surface. |
| CHG-004 | `refactor` | `yes` | `Centralize optional entry metadata in the canonical file_infos metadata surface and consume it from both listing and file-info flows.` | `src/file_infos/metadata.ts`, `src/file_infos/handler.ts`, `src/list-directory-entries/handler.ts` | `DESCRIPTION.md` records `src/file_infos/metadata.ts` as the metadata single source of truth. |

**Migration / Consumer Impact**

Consumers and MCP clients must migrate from `list_directories` and `directory_trees` to `list_directory_entries`.
The new tool returns TOON as the default structured output instead of the previous JSON or line-oriented text surfaces.
Clients must treat `type` as always present for each entry, must use `includeMetadata: true` to request optional metadata fields, and must consume same-level files and directories together when `recursive: false` is set.

**Commit Alignment**

| Field | Value |
|-------|-------|
| Commit Subject | `feat(filesystem-server)!: consolidate directory listing into list_directory_entries` |
| Breaking Footer | `BREAKING CHANGE: The legacy list_directories and directory_trees MCP tools are replaced by list_directory_entries, which returns TOON as the default structured listing format and changes the directory-listing consumer contract.` |
| Current HEAD Commit Hash | `30a55a921cfd0e92857c5978cb72bf681a821ca5` |

---

## 4. Semver Rules
[INTENT: REFERENCE]

- Patch = non-breaking correction, clarification, or metadata synchronization.
- Minor = backward-compatible addition.
- Major = breaking contract or incompatible architectural change.

---

## 5. Path Index
[INTENT: REFERENCE]

| # | Path | Relevance |
|---|------|-----------|
| 1 | `src/server.ts` | Root MCP tool registration and dispatch surface for the consolidated listing tool |
| 2 | `src/list-directory-entries/handler.ts` | Canonical structured directory-entry traversal and TOON encoding |
| 3 | `src/list-directory-entries/schema.ts` | Canonical input contract for traversal, metadata, and exclusion behavior |
| 4 | `src/file_infos/metadata.ts` | Metadata single source of truth used by listing and file-info flows |
| 5 | `src/file_infos/handler.ts` | Existing metadata endpoint aligned to the canonical metadata surface |
| 6 | `package.json` | Runtime dependency declaration for TOON |
| 7 | `package-lock.json` | Lockfile alignment for the consolidated runtime dependency graph |
