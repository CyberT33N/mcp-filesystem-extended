# Changelog: Filesystem MCP Server Workspace
[INTENT: REFERENCE]

---

## 1. Scope Metadata
[INTENT: CONTEXT]

| Field | Value |
|-------|-------|
| Scope Root | `.` |
| Versioning Standard | `Semantic Versioning 2.0.0` |
| Current Version | `1.2.0` |
| Semver Class | `minor` |
| Breaking Change | `no` |
| Commit Scope | `filesystem-server` |
| Current HEAD Commit Hash | `d944213b19d87a7c8447a46c2fafcd9b5fe97880` |

---

## 2. Version Ledger
[INTENT: REFERENCE]

| Version | Date | Class | Breaking | Commit Type | HEAD Commit Hash | Summary | Commit Subject |
|---------|------|-------|----------|-------------|------------------|---------|----------------|
| `1.2.0` | `2026-09-26` | `minor` | `no` | `feat` | `d944213b19d87a7c8447a46c2fafcd9b5fe97880` | `Add the create_symbolic_links and verify_symbolic_links endpoints for portable batch symbolic-link creation and read-only integrity verification.` | `feat(filesystem-server): add create_symbolic_links and verify_symbolic_links endpoints` |
| `1.1.0` | `2026-09-26` | `minor` | `no` | `feat` | `0c1ad4a0907d0897a4eb5c5771ee10ddb01fe9d0` | `Add the read-only verify_file_byte_identity endpoint for reference-based, region-aware byte-identity verification.` | `feat(filesystem-server): add verify_file_byte_identity endpoint` |
| `1.0.0` | `2026-04-03` | `major` | `yes` | `feat` | `30a55a921cfd0e92857c5978cb72bf681a821ca5` | `Consolidate legacy directory listing tools into the canonical TOON-based list_directory_entries surface.` | `feat(filesystem-server)!: consolidate directory listing into list_directory_entries` |

---

## 3. Current Version Entry
[INTENT: SPECIFICATION]

### 3.1 Version `1.2.0`
[INTENT: SPECIFICATION]

**Classification**

| Field | Value |
|-------|-------|
| Semver Class | `minor` |
| Breaking Change | `no` |
| Rationale | `The workspace gains the create_symbolic_links mutation endpoint and the verify_symbolic_links inspection endpoint. Together they provide portable relative and absolute symbolic-link creation with a documented Windows readiness convention and a privilege-free junction variant, plus read-only link integrity verification with target-drift and dangling detection. The change is purely additive: no existing endpoint, contract, or convention is modified.` |

**Change Units**

| ID | Category | Breaking | Summary | Affected Files | Description Alignment |
|----|----------|----------|---------|----------------|----------------------|
| CHG-001 | `feature` | `no` | `Add the create_symbolic_links endpoint with its schema, handler, and endpoint-local documentation triplet.` | `src/domain/mutation/create-symbolic-links/schema.ts`, `src/domain/mutation/create-symbolic-links/handler.ts`, `src/domain/mutation/create-symbolic-links/CONVENTIONS.md`, `src/domain/mutation/create-symbolic-links/DESCRIPTION.md`, `src/domain/mutation/create-symbolic-links/README.md` | `DESCRIPTION.md` documents the verbatim-target portability contract, the existing-link refusal, and the Windows readiness failure family. |
| CHG-002 | `feature` | `no` | `Add the verify_symbolic_links endpoint with its schema, handler, helpers, and endpoint-local documentation triplet.` | `src/domain/inspection/verify-symbolic-links/schema.ts`, `src/domain/inspection/verify-symbolic-links/handler.ts`, `src/domain/inspection/verify-symbolic-links/helpers.ts`, `src/domain/inspection/verify-symbolic-links/CONVENTIONS.md`, `src/domain/inspection/verify-symbolic-links/DESCRIPTION.md`, `src/domain/inspection/verify-symbolic-links/README.md` | `DESCRIPTION.md` documents the link-identity-preserving guard semantics, the verbatim comparison rule, and the resolvability dimension. |
| CHG-003 | `contract` | `no` | `Register both endpoints in their family tool catalogs with description builders and shared limit constants.` | `src/application/server/register-comparison-and-mutation-tool-catalog.ts`, `src/application/server/register-inspection-tool-catalog.ts`, `src/application/server/tool-registration-presets.ts`, `CONVENTIONS.md`, `DESCRIPTION.md`, `README.md` | Root `CONVENTIONS.md` and root `DESCRIPTION.md` re-reference the endpoint-local documentation triplets; root `README.md` carries the Windows readiness deployment convention. |
| CHG-004 | `docs` | `no` | `Document the symbolic-link endpoint conventions: ownership matrix, UAC posture, pre-check rejection rationale, and junction semantics.` | `docs/conventions/symlink-endpoints/overview.md` | The conventions document records what was decided, how the endpoints act, and why. |
| CHG-005 | `test` | `no` | `Cover both endpoints and the registration surfaces with unit tests at 100 percent white-box coverage of the new units.` | `test/unit/domain/mutation/create-symbolic-links/create-symbolic-links.test.ts`, `test/unit/domain/inspection/verify-symbolic-links/verify-symbolic-links.test.ts`, `test/unit/application/server/register-comparison-and-mutation-tool-catalog.test.ts`, `test/unit/application/server/register-inspection-tool-catalog.test.ts`, `test/unit/application/server/tool-registration-presets.test.ts` | Coverage-measured execution proves the new units in the unit project. |

**Migration / Consumer Impact**

No migration is required. The new endpoints are additive; existing endpoints and contracts are unchanged.
Consumers gain the `create_symbolic_links` tool for portable batch symbolic-link creation and the read-only `verify_symbolic_links` tool for link integrity verification.
Windows hosts must satisfy the documented readiness convention (Developer Mode or an elevated server process) for portable symbolic-link creation; directory links may use the privilege-free `junction` variant instead.

**Commit Alignment**

| Field | Value |
|-------|-------|
| Commit Subject | `feat(filesystem-server): add create_symbolic_links and verify_symbolic_links endpoints` |
| Breaking Footer | `none` |
| Current HEAD Commit Hash | `d944213b19d87a7c8447a46c2fafcd9b5fe97880` |

---

### 3.2 Version `1.1.0`
[INTENT: SPECIFICATION]

**Classification**

| Field | Value |
|-------|-------|
| Semver Class | `minor` |
| Breaking Change | `no` |
| Rationale | `The workspace gains the read-only verify_file_byte_identity inspection endpoint, which proves byte identity of one or more target files against a reference file over the whole file or a bound byte region. The change is purely additive: no existing endpoint, contract, or convention is modified.` |

**Change Units**

| ID | Category | Breaking | Summary | Affected Files | Description Alignment |
|----|----------|----------|---------|----------------|----------------------|
| CHG-001 | `feature` | `no` | `Add the verify_file_byte_identity endpoint with its schema, handler, helpers, and endpoint-local documentation triplet.` | `src/domain/inspection/verify-file-byte-identity/schema.ts`, `src/domain/inspection/verify-file-byte-identity/handler.ts`, `src/domain/inspection/verify-file-byte-identity/helpers.ts`, `src/domain/inspection/verify-file-byte-identity/CONVENTIONS.md`, `src/domain/inspection/verify-file-byte-identity/DESCRIPTION.md`, `src/domain/inspection/verify-file-byte-identity/README.md` | `DESCRIPTION.md` documents the reference-based, region-aware identity-verification surface and its fail-closed semantics. |
| CHG-002 | `feature` | `no` | `Extend the canonical checksum seam with region-scoped hashing (FileRegion, calculateFileRegionHash).` | `src/infrastructure/filesystem/checksum.ts` | `DESCRIPTION.md` records the region-hash seam as the single hashing home used by the new endpoint. |
| CHG-003 | `contract` | `no` | `Register verify_file_byte_identity in the inspection tool catalog with its description builder and the shared MARKER_MAX_CHARS limit constant.` | `src/application/server/register-inspection-tool-catalog.ts`, `src/application/server/tool-registration-presets.ts`, `src/domain/shared/guardrails/tool-guardrail-limits.ts`, `CONVENTIONS.md`, `DESCRIPTION.md` | Root `CONVENTIONS.md` and root `DESCRIPTION.md` re-reference the endpoint-local documentation triplet. |
| CHG-004 | `test` | `no` | `Cover the new endpoint, the region-hash seam, and the registration surface with unit tests at 100 percent white-box coverage of the new units.` | `test/unit/domain/inspection/verify-file-byte-identity/verify-file-byte-identity.test.ts`, `test/unit/infrastructure/filesystem/checksum.test.ts`, `test/unit/application/server/register-inspection-tool-catalog.test.ts`, `test/unit/application/server/tool-registration-presets.test.ts` | Coverage-measured execution proves the new units in the unit project. |

**Migration / Consumer Impact**

No migration is required. The new endpoint is additive; existing endpoints and contracts are unchanged.
Consumers gain the read-only `verify_file_byte_identity` tool for reference-based, region-aware byte-identity proofs.

**Commit Alignment**

| Field | Value |
|-------|-------|
| Commit Subject | `feat(filesystem-server): add verify_file_byte_identity endpoint` |
| Breaking Footer | `none` |
| Current HEAD Commit Hash | `0c1ad4a0907d0897a4eb5c5771ee10ddb01fe9d0` |

---

### 3.3 Version `1.0.0`
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
