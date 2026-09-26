---
name: "mcp-filesystem-extended-endpoint-description-governance"
description: "Always-on governance for MCP endpoint description surfaces in this repository. Activates whenever an endpoint is created or edited (schema.ts, handler.ts, registration catalogs, description builders, endpoint-local documentation, root indexes, changelog). Enforces the complete description-surface inventory, canonical reference anchoring through the POSIX adapter (Windows + Linux), a per-surface completeness ledger, and a blocking release gate so that every endpoint ships 100% complete, drift-free, LLM-optimized description text for agent consumers."
alwaysApply: true
---

# 🧾 MCP Endpoint Description Governance — Repository Rule
[INTENT: INSTRUCTION]

## [0] META
[INTENT: INSTRUCTION]

- **Artifact class:** This document is a **repository RULE** — an always-on
  governance unit of this repository. It is bound into the agent harness
  through the canonical binding mechanism (relative symlink from
  `.cursor/rules/`). It is **NOT** a standalone, complete, or isolated system
  prompt: it defines no persona, no task scope, and no runtime contract of its
  own, and it **MUST NEVER** redefine host-level governance.
- **Applicability:** **THIS REPOSITORY ONLY.** This rule activates whenever a
  task creates a new MCP endpoint or edits an existing MCP endpoint of this
  server — including its schema, handler, registration, description builder,
  documentation, or any adjacent catalog surface — per the recognition matrix
  in [3].
- **Scope:** This rule governs the **endpoint description domain** as one
  aggregate: endpoint-trigger recognition, canonical reference anchoring, the
  description-surface inventory, description-text authoring for the LLM-agent
  consumer, the per-surface completeness ledger, and the blocking release
  gate.
- **Priority:** This rule is an overlay convention. Higher-priority system,
  safety, workspace, and explicit user instructions always prevail. Within the
  endpoint description domain, this rule is **NOT NEGOTIABLE** and wins every
  conflict against model-default behavior.
- **Core Principle:** An endpoint is **described or stopped** — never shipped
  with a partial, drifted, or memory-authored description surface. The
  description surface of an endpoint is the only contract the consuming
  LLM agent ever sees; it is therefore produced from the canonical references
  bound in [4], proved per surface in the ledger in [7], and released only
  through the gate in [7.3].
- **Isolation:** This rule is fully self-contained for its operative contract.
  It references external knowledge documents and local convention surfaces
  only through the binding surface in [4]; it **MUST NOT** redefine tool
  routing, read governance, write governance, or naming/language governance —
  those domains are owned by their own dedicated governance surfaces.

---

## [1] PURPOSE
[INTENT: CONTEXT]

The consumer of an MCP endpoint description is an **LLM agent** that never
reads the implementation before choosing and shaping a call. Its entire
decision basis is the exposed description surface: the tool name, the tool
description, the parameter descriptions inside the input schema, the output
schema, the annotations, and the server-level instructions. When any of these
surfaces is missing, stale, duplicated across owners, or written to compensate
for a weak schema, the agent misroutes, misconstructs calls, or hallucinates
parameters — and the defect is invisible in the diff that caused it.

The characteristic defect classes in this repository context are:

- **Partial description shipping:** an endpoint is created or edited while
  only some of its description surfaces are updated (schema descriptions
  without the description builder, registration without the documentation
  triplet, code without the root index lines).
- **Description drift:** an edit changes behavior but leaves the description
  text of an older behavior in place.
- **Ownership collapse:** the same limit or rule is restated in parameter
  descriptions, the tool description, and error prose until the copies drift
  apart.
- **Memory-authored surfaces:** description text written from model habit
  instead of from the canonical MCP surface architecture and this project's
  own disclosure conventions.

This rule eliminates that defect class by binding every endpoint creation and
every endpoint edit to a **deterministic description contract**: recognize the
trigger, anchor the canonical references, bind the complete surface inventory,
materialize every surface, prove completeness per surface in a ledger, and
gate the release on that proof.

---

## [2] DEFINITIONS
[INTENT: SPECIFICATION]

- **Endpoint:** Any MCP tool registered on this server, regardless of family
  (discovery, metadata and integrity, search, read, comparison, mutation,
  server scope).
- **Endpoint description surface:** Every caller-visible or maintainer-visible
  text/contract surface that carries descriptive or selection semantics for an
  endpoint. The complete, canonical inventory is defined in [5]; no other
  inventory is authoritative.
- **Surface inventory binding:** The act of binding, for the active task,
  exactly which inventory entries are `materialized`, which are
  `not_applicable`, and why — before any writing begins.
- **Description completeness ledger:** The runtime proof surface that records
  every bound inventory entry of the active endpoint together with its status.
- **Description release gate:** The blocking gate in [7.3] that keeps the
  endpoint work unreleased until every ledger unit is `verified` or correctly
  `not_applicable`.
- **Whole-endpoint reassessment:** On an edit task, the obligation to re-prove
  the **entire** description surface of the touched endpoint — not only the
  edited delta — because description drift lives exactly in the untouched
  remainder.
- **Canonical references:** The documents bound in [4]. They are the only
  authoritative evidence for how description surfaces are shaped; model memory
  is candidate-generation input only.
- **Endpoint-bearing trigger surface:** Any task surface that creates or
  modifies an endpoint's code, schema, registration, description, or
  documentation files, or a plan/proposal that carries such content.

---

## [3] ACTIVATION — ENDPOINT-TRIGGER RECOGNITION MATRIX (M1)
[INTENT: SPECIFICATION]

- Before any file-bearing work is shaped, the agent **MUST** compute
  `endpoint_description_recognition_score` from `0` to `100`.
- The matrix **MUST** use these weighted axes:
  - target or scope files under `src/domain/<family>/<endpoint>/`
    (`schema.ts`, `handler.ts`, `helpers.ts`, documentation files): `0-40`
  - registration or server-framing surfaces touched
    (`src/application/server/register-*.ts`, `tool-registration-presets.ts`,
    `server-description.ts`, `server-instructions.ts`): `0-30`
  - explicit task vocabulary naming an endpoint, tool, MCP surface,
    description, or registration: `0-20`
  - root index or changelog surfaces touched for endpoint reasons
    (`CONVENTIONS.md`, `DESCRIPTION.md`, `README.md`, `CHANGELOG.md`): `0-10`
- Interpret the score conservatively:
  - `80-100` → `endpoint_description_governed`
  - `55-79` → `ambiguous_user_decision_required`; the agent **MUST** present
    the candidate classification and ask the user instead of deciding
    autonomously
  - `0-54` → `not_endpoint_description_governed`
- A task that merely reads endpoint code without creating or modifying any
  endpoint-bearing surface is **not** governed.

---

## [4] CANONICAL REFERENCE BINDING (POSIX ADAPTER — SSOT)
[INTENT: SPECIFICATION]

### [4.1] Path single source of truth

- if `os_family = windows`: `projects_base_posix = "C:/Projects"`
- if `os_family = linux`: `projects_base_posix = "/home/t33n/projects"`
- `ai_base_rules_root_abs_posix = projects_base_posix + "/ai/prompting/rules/ai-base-rules"`
- `mcp_knowledge_root_abs_posix = ai_base_rules_root_abs_posix + "/knowledge/domains/ai/mcp"`
- `mcp_server_surfaces_ref_abs_posix = mcp_knowledge_root_abs_posix + "/architectures/server/MCP_ARCHITECTURE_SERVER_SURFACES_LLM_OPTIMIZED_REFERENCE_001.mdc"`
- `mcp_guardrail_governance_ref_abs_posix = mcp_knowledge_root_abs_posix + "/architectures/server/guardrails/MCP_ARCHITECTURE_SERVER_GUARDRAIL_GOVERNANCE_REFERENCE_002.mdc"`
- `mcp_boundary_governance_ref_abs_posix = mcp_knowledge_root_abs_posix + "/architectures/server/guardrails/MCP_ARCHITECTURE_SERVER_GUARDRAIL_REFERENCE_DOCUMENT_BOUNDARY_GOVERNANCE_003.mdc"`
- when `os_family = windows`, `/` is converted to the runtime-required
  separator form for tool dispatch; when `os_family = linux`, runtime paths
  equal the `*_abs_posix` values.

The canonical references **MUST** be addressed exclusively through these
computed absolute paths — never through remembered, reconstructed, or
context-relative paths.

### [4.2] Runtime-read mandate

- For every governed task, the agent **MUST** fully read (100%, through the
  host's canonical read architecture) all three canonical references before
  authoring or modifying any description surface:
  1. `mcp_server_surfaces_ref_abs_posix` — information placement, tool naming
     (`<verb>_<object>[_qualifier]`), schema-first contracts, description
     economy, anti-pattern avoidance.
  2. `mcp_guardrail_governance_ref_abs_posix` — which limits are expressed as
     schema data, which budget rules belong in tool descriptions, which
     internals never surface.
  3. `mcp_boundary_governance_ref_abs_posix` — surface ownership, one
     statement one owner, pointing architecture, anti-duplication.
- The agent **MUST NOT** model, recall, paraphrase, or reconstruct the
  references' content from internal memory. Remembered content is
  non-authoritative even when it appears consistent.
- The runtime read **MUST** re-occur whenever the active epoch, the file read
  cycle, or the host's read-governance architecture requires a fresh anchor
  for those files.

### [4.3] Local convention surfaces (repository-anchored)

- In addition to the canonical references, the agent **MUST** read the
  following repository-local surfaces before authoring (repository-root
  relative, resolved against the current workspace root):
  - `CONVENTIONS.md` — root conventions, core invariants, endpoint-local
    conventions index.
  - `conventions/guardrails/public-limit-disclosure-governance.md` — which
    limits belong in parameter descriptions, which in tool descriptions,
    which stay internal.
  - `conventions/mcp-response-contract/structured-content-contract.md` —
    `content.text` primary-result authority and additive `structuredContent`
    mirroring for response text alignment.
  - The nearest **sibling endpoint** of the same family (its `schema.ts`,
    registration block, description builder, and documentation triplet) as
    the bound style anchor.
- If the governed task touches a surface whose family owns a dedicated
  convention leaf under `conventions/`, that leaf **MUST** be read as well.

---

## [5] ENDPOINT DESCRIPTION SURFACE INVENTORY (SSOT)
[INTENT: SPECIFICATION]

This section is the **single source of truth** for which surfaces a governed
endpoint carries. Each surface owns exactly one information class; the
ownership column is binding and derives from the canonical references in [4].

| ID | Surface | Location | Owns | Must NOT own |
|---|---|---|---|---|
| S1 | Parameter descriptions | `src/domain/<family>/<endpoint>/schema.ts` (`.describe()` per public parameter) | Syntax, intent, requiredness, and the public per-parameter limits, carried by the limit constants | Operation-wide budget narrative, retry doctrine, server philosophy |
| S2 | Maintainer behavior contract | `src/domain/<family>/<endpoint>/handler.ts` (+ `helpers.ts`) TSDoc on every exported type/function/member | Behavior, fail-closed semantics, ordering, partial-success semantics for maintainers | Caller-facing selection prose |
| S3 | Tool description | `src/application/server/tool-registration-presets.ts` (`build<Endpoint>ToolDescription()`) | Capability, selection cues ("use this tool when …"), qualitative guard awareness, the family response-budget rule | Exact per-parameter numeric limits (owned by S1), retry doctrine, duplicated schema truth |
| S4 | Registration block | `src/application/server/register-<family>-tool-catalog.ts` | `title`, `description` (via the S3 builder), `annotations`, `inputSchema`, `outputSchema` wiring | Inline description text that bypasses the builder |
| S5 | Endpoint-local conventions | `src/domain/<family>/<endpoint>/CONVENTIONS.md` | The one question the endpoint answers, non-obvious conventions, family invariants | Root-level TOC content, cross-endpoint policy |
| S6 | Endpoint-local architecture | `src/domain/<family>/<endpoint>/DESCRIPTION.md` | Detailed agent-facing architecture: request model, response model, validation/execution flow, sibling relationships | DX quick-start content |
| S7 | Endpoint-local DX summary | `src/domain/<family>/<endpoint>/README.md` | One-sentence purpose, minimal call examples, pointers to S5/S6 | Architecture detail |
| S8 | Root index lines | root `CONVENTIONS.md` (endpoint-local conventions index) and root `DESCRIPTION.md` (endpoint-local architecture index) | TOC/index routing to S5/S6 | Any endpoint detail |
| S9 | Changelog entry | root `CHANGELOG.md` | The additive change record for the endpoint work | Behavior narration beyond the change record |
| S10 | Server-level framing | `src/application/server/server-instructions.ts`, `server-description.ts` | **Only** genuinely new shared invariants that apply across endpoints | Per-endpoint semantics; repeated per-endpoint limits |

- **One statement, one owner:** every descriptive statement produced by the
  task **MUST** have exactly one primary owner surface from this inventory.
  Secondary surfaces may point or summarize qualitatively; they **MUST NOT**
  become competing authorities for the same exact semantics.
- **Edit tasks:** the inventory applies to the whole endpoint
  (whole-endpoint reassessment), not only to the edited delta.

---

## [6] ORDERED PHASE CONTRACT & STATE MACHINE
[INTENT: SPECIFICATION]

### [6.1] Ordered phase contract (non-swappable)

1. **Trigger recognition** — compute M1; bind the governed endpoint(s) and the
   concrete affected file set. Starting later phases before the affected set
   is resolved is forbidden as speculative work.
2. **Reference anchoring** — execute [4.2] and [4.3] completely.
3. **Surface inventory binding** — bind every inventory entry of [5] for the
   active task as `materialized` or `not_applicable` (with a one-line reason);
   creation tasks bind S1–S9 as `materialized` by default (S10 only when a new
   shared invariant genuinely emerges).
4. **Materialization** — author or update every `materialized` surface
   completely, in its owning style, from the anchored references.
5. **Verification** — prove per surface: naming per the canonical naming
   grammar, limit disclosure per the local disclosure governance, ownership
   per [5], response-text alignment per the structured-content contract, and
   100% ledger coverage.
6. **Release gate** — emit the gate report in [8]; release only on `PASS`.

A later phase **MUST NOT** begin before the current phase has met its exit
conditions. A passed earlier or broader proof **MUST NOT** substitute for a
later or narrower proof.

### [6.2] State machine

```text
INACTIVE ──(M1 governed)──▶ TRIGGER_BOUND
TRIGGER_BOUND ──(references fully read)──▶ REFERENCES_ANCHORED
REFERENCES_ANCHORED ──(inventory bound)──▶ INVENTORY_BOUND
INVENTORY_BOUND ──(all surfaces written)──▶ MATERIALIZED
MATERIALIZED ──(per-surface verification)──▶ VERIFIED
VERIFIED ──(gate report PASS)──▶ RELEASED
ANY ──(reference unreadable | unresolved ambiguity)──▶ STOPPED_ASK_USER
```

**Illegal transitions (protocol violations):** `TRIGGER_BOUND → MATERIALIZED`
(reference anchoring skipped), `INVENTORY_BOUND → VERIFIED` without complete
materialization, `MATERIALIZED → RELEASED` without the gate report, any
transition driven by model memory instead of anchored evidence.

---

## [7] DESCRIPTION COMPLETENESS LEDGER & RELEASE GATE
[INTENT: SPECIFICATION]

### [7.1] Ledger

- The agent **MUST** maintain `endpoint_description_ledger[]` — one unit per
  bound inventory entry, each tracking: `surface_id` (S1–S10), `target`
  (concrete file), `status` — exactly one of `pending` | `materialized` |
  `verified` | `not_applicable` | `blocked`.
- Coverage is binary: 100% of bound units **MUST** reach `verified` or a
  correctly reasoned `not_applicable` before release; 0% of unbound surfaces
  may be materialized.
- The ledger is scope-bound to the active task: a `verified` unit from an
  earlier task or a different endpoint is **never** reusable.

### [7.2] Verification criteria (per surface)

- **S1:** every public parameter carries a `.describe()`; stable public limits
  are disclosed through the limit constants inside the parameter description;
  no internal guardrail leaks.
- **S2:** every exported type, function, and member carries TSDoc in
  TSDoc-native syntax.
- **S3:** the builder text carries capability, selection cue, qualitative
  guard awareness, and the family budget rule; it repeats no S1-owned numeric
  limit and no schema-provable fact.
- **S4:** the registration uses the builder, carries annotations and both
  schemas; no inline description bypass.
- **S5–S7:** the triplet exists, is complete for its ownership class, and
  matches the sibling style anchor.
- **S8:** both root index lines exist and route correctly.
- **S9:** the changelog entry exists and is additive.
- **S10:** only materialized when a genuinely new cross-endpoint invariant
  emerged; otherwise `not_applicable`.

### [7.3] Release gate

- `endpoint_description_gate_status = pass` only when:
  - activation is bound (M1 governed),
  - the canonical references and local convention surfaces were fully read,
  - every ledger unit is `verified` or correctly `not_applicable`,
  - the verification criteria of [7.2] hold for every `verified` unit.
- If any condition is missing, the endpoint work remains blocked.

---

## [8] REQUIRED NOTICES
[INTENT: SPECIFICATION]

- When this rule activates (M1 governed), the agent **MUST** emit exactly one
  activation notice using the hardcoded unique symbol `🧾`, equivalent in
  meaning to:
  `🧾 Endpoint description governance notice (endpoint_description_governance_active): Endpoint-bearing work detected. The canonical MCP references and local convention surfaces are being anchored, the description-surface inventory is being bound, and every surface is being proved in the completeness ledger before release.`
- The notice **MUST** include concise detail lines for: the bound endpoint(s),
  the detected trigger evidence, and the bound inventory size.
- Before release, the agent **MUST** emit exactly one gate report using the
  shared gate-report plane symbol `🛂`, equivalent in meaning to:
  `🛂 Endpoint description gate report (endpoint_description_release_check): Activation = PASS|FAIL. Reference anchoring = PASS|FAIL. Inventory coverage = PASS|FAIL. Surface verification = PASS|FAIL. Release permission = PASS|FAIL.`
- When a blocking condition exists (a canonical reference is unreadable, the
  recognition is ambiguous without a user decision, a surface cannot be
  verified), the agent **MUST** emit a blocking stop notice using the shared
  blocking-stop plane symbol `⛔` and keep the endpoint work blocked until the
  condition is resolved.
- **Icon-uniqueness duty:** the `🧾` symbol of this rule was assigned only
  after a uniqueness check against the host's assigned lead-symbol registry;
  `🛂` and `⛔` are reused inside the declared shared gate-report and
  blocking-stop planes. Any future new notice identity on this rule's surface
  **MUST** pass the same uniqueness check before assignment.

---

## [9] CONSTRAINTS
[INTENT: CONSTRAINT]

### MUST (UNCONDITIONALLY REQUIRED)
- You **MUST** run the recognition matrix (M1) before shaping any
  endpoint-bearing work in this repository.
- You **MUST** fully read the canonical references and the local convention
  surfaces of [4] for every governed task, through the computed absolute
  POSIX paths and the repository-relative paths — never from memory.
- You **MUST** bind the complete surface inventory of [5] per governed task
  and prove every bound surface in the ledger before release.
- You **MUST** apply whole-endpoint reassessment on edit tasks.
- You **MUST** keep every descriptive statement at exactly one primary owner
  surface.
- You **MUST** emit the required notices (`🧾`, `🛂`, `⛔`) when their
  triggers fire.

### MUST NOT (ABSOLUTELY FORBIDDEN)
- You **MUST NEVER** ship an endpoint creation or edit with a partial
  description surface while any ledger unit is `pending` or `blocked`.
- You **MUST NEVER** author description text from model memory, naming habit,
  or sibling resemblance without the anchored references.
- You **MUST NEVER** duplicate the same exact limit, rule, or semantic
  statement across multiple description surfaces as competing authorities.
- You **MUST NEVER** place per-endpoint detail into root index files or
  server-level framing, and never place shared invariants into per-endpoint
  descriptions.
- You **MUST NEVER** treat a passed earlier or broader proof (a read anchor, a
  write gate, a typecheck) as proof of description completeness.
- You **MUST NEVER** reuse a verification result from an earlier task or a
  different endpoint.

---

## [10] COMPLIANCE GATE (RUN BEFORE ANY GOVERNED RELEASE)
[INTENT: VALIDATION]

1. ☐ Recognition matrix (M1) computed; the governed endpoint set and the
   affected file set bound from evidence?
2. ☐ All three canonical references fully read through the computed absolute
   POSIX paths — never from memory?
3. ☐ All applicable local convention surfaces of [4.3] fully read, including
   the nearest sibling endpoint style anchor?
4. ☐ Surface inventory bound; creation tasks carry S1–S9 as `materialized`;
   every `not_applicable` carries a one-line reason?
5. ☐ Every ledger unit `verified` or correctly `not_applicable`; no
   `pending`/`blocked` unit remains?
6. ☐ The per-surface verification criteria of [7.2] evidenced for every
   `verified` unit (naming, limit disclosure, ownership, response-text
   alignment)?
7. ☐ Whole-endpoint reassessment performed on edit tasks?
8. ☐ `🧾` activation notice and `🛂` gate report emitted; release only after
   `Release permission = PASS`?

Any `FAIL` **BLOCKS** the release: correct first, or stop and inform the user.

---

## [11] ARCHITECTURAL RATIONALE
[INTENT: CONTEXT]

- **DDD — Bounded Context:** every description surface is a bounded context
  with exactly one information class; the inventory in [5] is the context map
  that keeps ownership explicit.
- **DDD — Anti-Corruption Layer:** the mandatory reference anchoring is the
  ACL between the canonical MCP surface architecture and this repository —
  remembered or habitual description text never corrupts the public contract
  when verified evidence exists.
- **DDD — Ubiquitous Language:** `endpoint description surface`, `surface
  inventory binding`, and `description completeness ledger` are canonical
  terms with exact meanings — no implied completeness.
- **12-Factor III (Config):** the recognition matrix, the inventory, and the
  notice symbols are configuration — decided once here, never re-derived per
  task.
- **12-Factor V (Build, Release, Run):** anchoring, materialization,
  verification, and release are strictly separated stages; a passed earlier
  stage never blends into the release proof.
- **DWCEA:** completeness is output-gated (visible notices, a per-surface
  ledger, a blocking release gate), heuristic exits ("the description is
  probably fine", "the sibling already covers it") are forbidden, and every
  ambiguity resolves to a stop-and-ask path.
