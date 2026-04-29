# Search Platform Endpoint Lane Matrix

> **Context:** See [`overview.md`](./overview.md) for the search-platform architecture baseline.

---

## Purpose

This document provides the endpoint-family capability and lane matrix for the search platform and its immediately adjacent inspection families.

---

## Matrix

| Endpoint | Family type | Primary backend | Explicit-file large text search | Recursive admission | Supported resume modes | Hard refusal still valid when |
|---|---|---|---|---|---|---|
| `search_file_contents_by_fixed_string` | preview-capable search | `ugrep` literal lane | allowed on supported text states | yes | `next-chunk`, `complete-result` | unsupported content state, invalid request, structural/runtime failure, final caps/fuse |
| `search_file_contents_by_regex` | preview-capable search | `ugrep` regex lane | allowed on supported text states | yes | `next-chunk`, `complete-result` | unsupported content state, unsafe regex, runtime failure, final caps/fuse |
| `list_directory_entries` | preview-capable discovery | filesystem traversal | not applicable | yes | `next-chunk`, `complete-result` | narrowing-required, deeper fuse, final caps/fuse |
| `find_files_by_glob` | preview-capable discovery | filesystem traversal | not applicable | yes | `next-chunk`, `complete-result` | narrowing-required, deeper fuse, final caps/fuse |
| `find_paths_by_name` | preview-capable discovery | filesystem traversal | not applicable | yes | `next-chunk`, `complete-result` | narrowing-required, deeper fuse, final caps/fuse |
| `count_lines` | completion-backed only | streaming counter or shared native-search lane | file reads/counts are bounded by counting semantics, not by preview-family text search rules | yes | `complete-result` only | unsupported content state, invalid request, final caps/fuse |
| `read_file_content` | bounded read family | text-read core + streaming readers | not a search family | no | none | projected/actual read budgeting, unsupported content state |
| `read_files_with_line_numbers` | bounded read family | text-read core | not a search family | no | none | projected/actual read budgeting, unsupported content state |

---

## Interpretation Rules

### Preview-capable search families

For the two search families:

- explicit-file eligibility is determined first by path validation, content-state compatibility, and runtime search safety,
- recursive workloads use the shared traversal admission planner,
- caller-visible output remains bounded by family caps and the global fuse,
- resumable responses expose `next-chunk` and `complete-result`.

### Discovery families

The discovery families do not use `ugrep`. Their breadth is controlled by traversal admission, preview-lane runtime budgets, and the same resume-session architecture.

### Count family

`count_lines` is intentionally distinct:

- no preview-style partial totals,
- completion-backed only once it leaves inline,
- same-endpoint resume still applies,
- but the family does not become a preview-family payload surface.

### Read families

Read families are not part of the search-platform lane model and must not inherit explicit-file search governance from the search families.

---

## Non-Negotiable Rules

1. The preview-capable search family set is exactly two endpoints.
2. The preview-capable discovery family set is exactly three endpoints.
3. `count_lines` remains completion-backed only.
4. Read families remain outside the search-platform resume/search governance.
5. Explicit-file large text search on supported content states is allowed on the search families.
