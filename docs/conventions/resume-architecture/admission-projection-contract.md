# Admission Projection Contract

> **Context:** See [`CONVENTIONS.md`](../../../CONVENTIONS.md) for the root conventions index and core invariants.
> **Related:** [`overview.md`](./overview.md) for the resume-session model and the envelope table.
> **Related:** [`../guardrails/public-limit-disclosure-governance.md`](../guardrails/public-limit-disclosure-governance.md) for the limit-disclosure classes and the projection-surface distinction.
> **Related:** [`../guardrails/overview.md`](../guardrails/overview.md) for the guardrail stack the probe evidence feeds into.

---

## Purpose

This document is the single source of truth for the **admission projection contract**: the honest, machine-readable workload projection that the five volumenrisiko-bearing discovery and search endpoints carry inside the existing `admission` response envelope.

It defines:

1. **what the projection is** and which surface owns it,
2. **the band vocabulary and its canonical calibration ownership**,
3. **why no raw numbers are returned** — the binding rationale,
4. **what is architecturally forbidden** and why,
5. **the correct consumer architecture** on the orchestration layer,
6. and the tool-agnostic knowledge references this contract is built on.

**Source:** [`src/domain/shared/guardrails/traversal-admission-projection.ts`](../../../src/domain/shared/guardrails/traversal-admission-projection.ts)

---

## 1. What the Projection Is

`structuredContent.admission.projection` is an optional, additive envelope field on the five preview-capable discovery and search endpoints:

- `list_directory_entries`
- `find_paths_by_name`
- `find_files_by_glob`
- `search_file_contents_by_regex`
- `search_file_contents_by_fixed_string`

It is derived from the bounded candidate-workload probe that already runs per base request before traversal execution. It carries exactly four fields:

| Field | Meaning | Confidence base |
|---|---|---|
| `estimatedTotalEntries` | Coarse band of the total candidate-entry volume observed by the probe | measured |
| `estimatedTotalCandidateBytes` | Coarse band of the total candidate bytes observed by the probe | measured |
| `estimatedTotalResponseChars` | Coarse band of the projected caller-visible response characters | modeled (family response estimator) |
| `estimatedRemainingDurationMs` | Coarse band of the modeled remaining execution duration | modeled (family execution-cost model) |

Every field is either:

- a **band form** `{ band, confidence, probeTruncated }`, or
- an **unavailable form** `{ available: false, reason }` with one canonical reason (`probe_truncated_hard`, `match_density_unknown`, `no_execution_cost_model`).

### Lane behavior

- **Base requests (birth admission):** the projection is present whenever the request collected probe evidence — including `inline` outcomes. An inline result near the family cap is exactly the "no refusal event, but material volume" case this surface exists for.
- **Resume passes (`next-chunk`, `complete-result`):** the projection is absent. Resume passes never re-run the blocking probe; the birth-admission projection was already delivered with the session's first response.

---

## 2. Band Vocabulary and Calibration Ownership

The canonical band set is `small | medium | large | huge` with the declared confidence `low | medium | high`.

**Calibration ownership (binding):** the band thresholds are owned **exclusively by the tool**, inside [`traversal-admission-projection.ts`](../../../src/domain/shared/guardrails/traversal-admission-projection.ts). The tool owns filesystem-scale knowledge; the consuming orchestration layer owns the *behavior per band*, never the thresholds themselves.

The calibration is deliberately an order-of-magnitude classification (volume classes at 10^ boundaries), not a guardrail constant restatement. Band thresholds may be recalibrated with evidence inside the tool without any contract change on the consumer side.

---

## 3. Why No Raw Numbers Are Returned (Binding Rationale)

The projection deliberately returns **no raw numeric values**. The rationale is architectural, not cosmetic:

1. **Probe numbers are not truth.** A probe value is an estimate derived from bounded sampling of already-processed state with an unknown error bar — and a documented *lower bound* when `probeTruncated = true`. A raw number would assert a precision that does not exist (token-size blindness: exact pre-execution size computation is impossible).
2. **Numbers force threshold duplication into the rules.** Raw values would require every consuming rule to define its own band thresholds per tool domain (filesystem entries, match counts, byte volumes) — duplicating scale knowledge that is canonical at the tool and corrupting the single source of truth.
3. **Numbers invite forbidden arithmetic.** Agents given numbers start calculating with them (size-arithmetic chunking, precise planning on lower bounds) — producing confident nonsense and re-creating the improvisation defect class the projection exists to eliminate.
4. **The band comparison is the correct decision form.** The remaining-context side of every orchestration comparison is itself a band; an exact number on one side of a band×band comparison adds no decision-relevant information — only false precision.

Exact numeric values remain reserved for surfaces where they are **true facts**: post-execution counts, schema caps, and refusal projections (for example a metadata preflight rejection that carries the exact measured overflow).

---

## 4. What Is Architecturally Forbidden

1. **Fabricated precision is forbidden.** No projection field may ever carry a naked numeric value, a percentage, or a decimal estimate. Every field is a band or an honest unavailable marker — enforced by the shared zod contract.
2. **Projection-driven planning is forbidden.** The projection is `artifact_projection_only`: it mirrors probe truth; it must never become a planning, escalation, or spawn authority by itself. Escalation decisions belong to the consuming governance rule and its user decision gates.
3. **Band thresholds in consumers are forbidden.** Consuming rules must act on the band vocabulary, never re-derive numeric thresholds for tool domains.
4. **Size-arithmetic chunking on projection values is forbidden** — estimates are lower bounds, not budgets.
5. **Tool-text disclosure of probe internals is forbidden** (budgets, ceilings, sampling windows stay Class D internals). The tool description carries exactly one qualitative capability cue per endpoint and no projection numbers.
6. **content.text mirroring duties are unchanged.** The projection is protocol metadata in the machine-readable envelope; the primary-result completeness of `content.text` is untouched by this contract.

---

## 5. Correct Consumer Architecture (Orchestration Layer)

The contractual connection between the tool and the orchestration layer:

- **The tool defines** what `small`, `medium`, `large`, and `huge` mean for its domain, and declares how reliable each value is (confidence, truncation, unavailability).
- **The orchestration rule defines** how to act per band: it weighs the workload band against its own situational axes (remaining context budget band, refusal-boundary events already hit, continuation rounds consumed, delegability) through its weighted matrices, hard caps, and interactive user gates.
- **The user stays the escalation authority.** A band never autonomously triggers a sub-agent spawn, a scope split, or an abandonment; the rule proposes, the user decides.

This split keeps the tool's measurement vocabulary stable while the orchestration policy evolves — and it is the highest prompt-efficiency form: the band set is the lossless-for-decision compression of the measurement, transported across orchestration and hand-off boundaries at minimal token cost.

---

## 6. Tool-Agnostic Knowledge References

The transferable principles behind this contract live in the private knowledge hub (this project is private and architecturally authorized to reference it; the hub itself stays tool-agnostic and never re-references this tool):

- **Workflow-State-Mutation Projection Gate** — `artifact_projection_only`: a workflow-state surface may mirror a bound contract, never re-determine it.
  `C:/Projects/ai/prompting/rules/ai-knowledge-hub/knowledge/domains/llm/prompting/techniques/runtime-governance/workflow-state-mutation-projection-gate.md`
- **Response-Limit Truncation** — token-size blindness and the coarse-band epistemics (prognosis from already-processed state; no content pre-materialization, no size-arithmetic chunking).
  `C:/Projects/ai/prompting/rules/ai-knowledge-hub/knowledge/domains/llm/prompting/troubleshooting/response-limits/response-limit-truncation.md`
- **Count Discrepancy** — completeness cross-validation and tolerance discipline for delivered-versus-counted inventories.
  `C:/Projects/ai/prompting/rules/ai-knowledge-hub/knowledge/domains/llm/prompting/troubleshooting/parallel/batch-processing/count-discrepancy.md`

---

## Summary Table

| Concern | Owner |
|---|---|
| Probe mechanics (budgets, ceilings, sampling windows) | [`traversal-candidate-workload.ts`](../../../src/domain/shared/guardrails/traversal-candidate-workload.ts) + guardrail stack — Class D internals |
| Band thresholds and calibration | [`traversal-admission-projection.ts`](../../../src/domain/shared/guardrails/traversal-admission-projection.ts) — tool-owned |
| Projection semantics and honest unavailable markers | this document + the shared module |
| Projection surface placement | `structuredContent.admission.projection` (machine-readable envelope only) |
| Behavior per band (escalation, delegation, gates) | the consuming orchestration rule + user decision |
| Tool-description awareness | one qualitative cue per endpoint — never numbers |
