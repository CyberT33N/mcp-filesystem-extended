/**
 * Search-family admission tuning constants shared by the regex and fixed-string inspection endpoints.
 *
 * @remarks
 * These values are intentionally owned by the `inspection/search` family rather than by the
 * workspace-wide guardrail registry. They express family-specific business intent:
 * preview-first must remain available, but moderate recursive code-search workloads must not be
 * pushed into preview-first so early that most realistic agent flows immediately require a second
 * `complete-result` request.
 *
 * The values below therefore relax the older preview posture without weakening the global fuse,
 * the same-endpoint resume contract, or the additive `complete-result` model.
 *
 * Architectural ordering:
 * - regex remains stricter than fixed-string,
 * - fixed-string remains slightly more inline-friendly,
 * - both are less preview-eager than the prior configuration.
 */

/**
 * Family-owned inline execution budget override for regex search.
 *
 * @remarks
 * The shared generic traversal-inline execution budgets were too low for moderate recursive
 * code-search workloads in practice once candidate-file fan-out and bounded response shaping were
 * combined. This override raises the regex inline allowance so compact-result recursive searches do
 * not prematurely fall into preview-first.
 */
export const SEARCH_FAMILY_REGEX_INLINE_EXECUTION_BUDGET_MS = 12_000;

/**
 * Family-owned inline execution budget override for fixed-string search.
 *
 * @remarks
 * Fixed-string search is narrower and cheaper than regex search. It therefore receives a slightly
 * larger inline execution window so exact-literal recursive workloads remain inline more often than
 * regex when the projected caller-visible result surface is still compact.
 */
export const SEARCH_FAMILY_FIXED_STRING_INLINE_EXECUTION_BUDGET_MS = 14_000;

/**
 * Family-owned estimated per-candidate-file admission cost for regex search.
 *
 * @remarks
 * The earlier regex admission estimate was intentionally conservative, but it over-triggered
 * preview-first for realistic recursive code-search workloads. This lower estimate better reflects
 * modern enterprise search expectations while still preserving a stricter posture than fixed-string
 * search.
 */
export const SEARCH_FAMILY_REGEX_ESTIMATED_PER_CANDIDATE_FILE_COST_MS = 90;

/**
 * Family-owned estimated per-candidate-file admission cost for fixed-string search.
 *
 * @remarks
 * Exact fixed-string matching is narrower than regex search and is often used for direct literal
 * verification. The family therefore models a lower per-candidate-file admission cost here so the
 * fixed-string lane remains slightly more inline-friendly than regex.
 */
export const SEARCH_FAMILY_FIXED_STRING_ESTIMATED_PER_CANDIDATE_FILE_COST_MS = 60;
