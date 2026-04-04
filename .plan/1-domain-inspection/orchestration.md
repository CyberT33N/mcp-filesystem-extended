---
file_type: "orchestration"
file_id: "1-domain-inspection"
unit_name: "Domain Inspection Contract Ownership"
parent_orchestration: "../../PLAN.md"
hierarchy_level: 1
unit_status: "done"
total_tasks: 4
completed_tasks: 4
has_sub_units: false
sub_unit_count: 0
---

# Unit 1: Domain Inspection Contract Ownership

## Navigation
- **Parent Orchestration:** [`PLAN.md`](../../PLAN.md)
- **This Unit:** `.plan/1-domain-inspection/`
- **Hierarchy Level:** 1
- **Unit Status:** done
- **Progress:** 4/4 tasks

## Tasks
- [x] **1.1 List-directory-entries result contract extraction** → [`1.1-list-directory-entries-result-contract-extraction.md`](./1.1-list-directory-entries-result-contract-extraction.md)
  - Classification: `ISOLATED`
  - Status: `DONE`
  - Complexity: `MEDIUM`
  - Files Modified: `src/domain/inspection/list-directory-entries/schema.ts`
  - Blocked By: `none`
  - Summary: Move the structured output schema for the directory-entry listing surface into the owning inspection schema module and document its canonical domain ownership.
- [x] **1.2 Metadata and checksum result contract extraction** → [`1.2-metadata-and-checksum-result-contract-extraction.md`](./1.2-metadata-and-checksum-result-contract-extraction.md)
  - Classification: `ISOLATED`
  - Status: `DONE`
  - Complexity: `MEDIUM`
  - Files Modified: `src/domain/inspection/get-path-metadata/schema.ts`, `src/domain/inspection/get-file-checksums/schema.ts`, `src/domain/inspection/verify-file-checksums/schema.ts`
  - Blocked By: `none`
  - Summary: Introduce domain-owned result schemas for metadata and checksum tools so the application layer consumes canonical inspection contracts instead of defining parallel result objects.
- [x] **1.3 Search and count result contract extraction** → [`1.3-search-and-count-result-contract-extraction.md`](./1.3-search-and-count-result-contract-extraction.md)
  - Classification: `ISOLATED`
  - Status: `DONE`
  - Complexity: `HIGH`
  - Files Modified: `src/domain/inspection/find-paths-by-name/schema.ts`, `src/domain/inspection/find-files-by-glob/schema.ts`, `src/domain/inspection/search-file-contents-by-regex/schema.ts`, `src/domain/inspection/count-lines/schema.ts`
  - Blocked By: `none`
  - Summary: Add canonical domain-owned result schemas for inspection search and counting tools, including precise structured-content ownership for search, glob, and line-count result surfaces.
- [x] **1.4 Inspection schema export and legacy-name normalization** → [`1.4-inspection-schema-export-and-legacy-name-normalization.md`](./1.4-inspection-schema-export-and-legacy-name-normalization.md)
  - Classification: `SEQUENTIAL`
  - Status: `DONE`
  - Complexity: `HIGH`
  - Files Modified: `src/domain/inspection/list-directory-entries/schema.ts`, `src/domain/inspection/get-path-metadata/schema.ts`, `src/domain/inspection/get-file-checksums/schema.ts`, `src/domain/inspection/verify-file-checksums/schema.ts`, `src/domain/inspection/find-paths-by-name/schema.ts`, `src/domain/inspection/find-files-by-glob/schema.ts`, `src/domain/inspection/search-file-contents-by-regex/schema.ts`, `src/domain/inspection/count-lines/schema.ts`, `src/domain/inspection/read-files-with-line-numbers/schema.ts`
  - Blocked By: `none`
  - Summary: Normalize remaining inspection schema export names to target-state terminology and make the final domain export surface ready for application-layer registration imports without central duplication.

## Internal Dependencies (This Level)
| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| D1 | 1.1 | 1.4 | SHARED_FILE | RESOLVED | The final inspection export normalization must run after the list-directory-entries contract extraction because both tasks modify the same schema ownership surface. | `src/domain/inspection/list-directory-entries/schema.ts` |
| D2 | 1.2 | 1.4 | SHARED_FILE | RESOLVED | The final inspection export normalization must run after the metadata and checksum contract extraction because both tasks modify the same schema ownership surfaces. | `src/domain/inspection/get-path-metadata/schema.ts`, `src/domain/inspection/get-file-checksums/schema.ts`, `src/domain/inspection/verify-file-checksums/schema.ts` |
| D3 | 1.3 | 1.4 | SHARED_FILE | RESOLVED | The final inspection export normalization must run after the search and count contract extraction because both tasks modify the same search/count schema ownership surfaces. | `src/domain/inspection/find-paths-by-name/schema.ts`, `src/domain/inspection/find-files-by-glob/schema.ts`, `src/domain/inspection/search-file-contents-by-regex/schema.ts`, `src/domain/inspection/count-lines/schema.ts` |

## Execution Order
1. Run `1.1`, `1.2`, and `1.3` in any order or in parallel because they do not share modified files.
2. Re-anchor all touched inspection schema files after `1.1` through `1.3` are complete.
3. Run `1.4` only after all three predecessor tasks are done and the shared schema surfaces have been refreshed.

## Notes for Orchestrating Agent
- Keep all structured output schema ownership inside the domain inspection schema modules. Do not let the application layer retain a second result-schema surface.
- Preserve the existing handler behavior while moving contract ownership. This unit is about canonical schema placement and export normalization, not about changing business logic.
- The application layer in Unit 3 is waiting on the outputs of this unit. Do not modify [`register-tool-catalog.ts`](../../src/application/server/register-tool-catalog.ts) from this unit.
- When `1.4` begins, re-read every schema file listed in the SHARED_FILE dependency table before applying the final normalization pass.
- After all tasks are done, the unit handoff artifact is a stable inspection-domain contract surface that Unit 3 can import directly.
