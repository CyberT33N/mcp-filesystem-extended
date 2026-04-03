---
file_type: "orchestration"
file_id: "3-application-server"
unit_name: "Application Server Composition and Tool-Catalog Decomposition"
parent_orchestration: "../../PLAN.md"
hierarchy_level: 1
unit_status: "pending"
total_tasks: 4
completed_tasks: 0
has_sub_units: false
sub_unit_count: 0
---

# Unit 3: Application Server Composition and Tool-Catalog Decomposition

## Navigation
- **Parent Orchestration:** [`PLAN.md`](../../PLAN.md)
- **This Unit:** `.plan/3-application-server/`
- **Hierarchy Level:** 1
- **Unit Status:** pending
- **Progress:** 0/4 tasks

## Tasks
- [ ] **3.1 Inspection registration module extraction** → [`3.1-inspection-registration-module-extraction.md`](./3.1-inspection-registration-module-extraction.md)
  - Classification: `WAITING`
  - Status: `pending`
  - Complexity: `MEDIUM`
  - Files Modified: `src/application/server/register-inspection-tool-catalog.ts`
  - Blocked By: `PLAN:D1`
  - Summary: Create a dedicated application-layer inspection registration module that consumes the finalized domain-owned inspection schemas and keeps registration logic out of the monolithic catalog root.
- [ ] **3.2 Comparison and mutation registration module extraction** → [`3.2-comparison-and-mutation-registration-module-extraction.md`](./3.2-comparison-and-mutation-registration-module-extraction.md)
  - Classification: `WAITING`
  - Status: `pending`
  - Complexity: `HIGH`
  - Files Modified: `src/application/server/register-comparison-and-mutation-tool-catalog.ts`
  - Blocked By: `PLAN:D2`
  - Summary: Create a dedicated application-layer registration module for comparison and mutation tools that imports finalized domain contracts and eliminates central registration sprawl.
- [ ] **3.3 Registration presets and server-scope tool isolation** → [`3.3-registration-presets-and-server-scope-tool-isolation.md`](./3.3-registration-presets-and-server-scope-tool-isolation.md)
  - Classification: `ISOLATED`
  - Status: `pending`
  - Complexity: `MEDIUM`
  - Files Modified: `src/application/server/tool-registration-presets.ts`, `src/application/server/register-server-scope-tools.ts`
  - Blocked By: `none`
  - Summary: Extract annotation presets, execution presets, and server-scope-only registration concerns into dedicated application modules so the composition root stays thin and purpose-specific.
- [ ] **3.4 Final composition root slim-down and server wiring update** → [`3.4-final-composition-root-slim-down-and-server-wiring-update.md`](./3.4-final-composition-root-slim-down-and-server-wiring-update.md)
  - Classification: `WAITING`
  - Status: `pending`
  - Complexity: `HIGH`
  - Files Modified: `src/application/server/register-tool-catalog.ts`, `src/application/server/filesystem-server.ts`
  - Blocked By: `3.1, 3.2, 3.3`
  - Summary: Replace the oversized catalog body with a composition root that delegates to bounded registration modules and keep filesystem-server wiring aligned to the decomposed application topology.

## Internal Dependencies (This Level)
| ID | Source Task | Target Task | Type | Status | Description | Shared Files |
|----|------------|-------------|------|--------|-------------|--------------|
| D1 | 3.1 | 3.4 | SEQUENTIAL | UNRESOLVED | The final composition root update must wait until the dedicated inspection registration module exists and exposes its stable application registration surface. | none |
| D2 | 3.2 | 3.4 | SEQUENTIAL | UNRESOLVED | The final composition root update must wait until the comparison and mutation registration module exists and exposes its stable application registration surface. | none |
| D3 | 3.3 | 3.4 | SEQUENTIAL | UNRESOLVED | The final composition root update must wait until registration presets and server-scope isolation modules exist so the root can delegate instead of re-declaring these concerns inline. | none |

## Execution Order
1. Start `3.3` immediately because it does not depend on upstream domain completion.
2. Run `3.1` after Unit 1 is complete and `3.2` after Unit 2 is complete.
3. Re-anchor the newly created registration modules and the existing application files before starting `3.4`.
4. Run `3.4` only after `3.1`, `3.2`, and `3.3` are all done.

## Notes for Orchestrating Agent
- Keep all output schema ownership in the domain modules. Application registration modules may import and register those contracts, but they must not create a second contract source.
- `list_allowed_directories` remains an application/server-owned concern because it describes server scope rather than a domain filesystem capability.
- The decomposed application layer should expose bounded registration modules, not a second domain abstraction layer. This is composition, not business-logic relocation.
- Preserve MCP initialization behavior and filesystem-server semantics while thinning the catalog root. The goal is bounded composition, not transport behavior change.
- When `3.4` begins, re-read [`register-tool-catalog.ts`](../../src/application/server/register-tool-catalog.ts) and [`filesystem-server.ts`](../../src/application/server/filesystem-server.ts) immediately before applying the final composition rewrite.
