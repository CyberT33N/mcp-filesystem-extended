# MCP Filesystem Extended — Architecture Conventions

This document is the entry point for the architecture conventions of this project. Each linked document covers one specific architectural concern. All implementation decisions that are non-obvious from local code context are documented here so that both autonomous LLM agents and human engineers can reason correctly about the design without re-deriving it from source.

---

## Table of Contents

| Document | Covers |
|---|---|
| [Guardrails Overview](conventions/guardrails/overview.md) | All guardrail layers, their placement, limits, and scope |
| [Resume Architecture Overview](conventions/resume-architecture/overview.md) | Resume-session model, delivery modes, endpoint families, and scope reduction |
| [Resume Architecture Workflow](conventions/resume-architecture/workflow.md) | Step-by-step execution flow for each delivery mode |
| [Guardrail–Resume Interaction](conventions/resume-architecture/guardrail-interaction.md) | Which guardrails apply in which mode, the mode-aware cap rule, and the global fuse as the non-bypassable floor |

---

## Core Invariants

The following rules are non-negotiable across the entire codebase:

1. **The global response fuse is always active.** `GLOBAL_RESPONSE_HARD_CAP_CHARS = 600,000` in the server shell (`src/application/server/filesystem-server.ts`) is the last, non-bypassable safety ceiling for every MCP tool response across all delivery modes.

2. **Family-level response caps apply only in inline and `next-chunk` delivery modes.** They must not block responses in `complete-result` mode. The global fuse is the ceiling for `complete-result` responses.

3. **Admission-layer timeouts and budgets are routing logic, not blocking guards for `complete-result`.** They remain active and correct for all modes because they determine which delivery lane is needed. They do not block `complete-result` execution.

4. **`count_lines` is completion-backed only.** It never exposes preview-style partial totals and never supports `resumeMode = 'next-chunk'`.

5. **Resume is same-endpoint and token-only.** No second public endpoint, no query resend on resume-only requests.

6. **Scope reduction is always a first-class alternative.** Every affected endpoint family must surface scope reduction guidance alongside resume guidance.

7. **`complete-result` responses are additive, not redundant.** When a caller resumes a preview-first session with `resumeMode = 'complete-result'`, the server continues traversal from the persisted frontier position and returns only entries not already delivered in the prior preview chunk. The `admission.guidanceText` field in every `complete-result` response must be a machine-readable statement that the caller must combine both payloads for the complete dataset.
