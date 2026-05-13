/**
 * Shared bounded-stop-state vocabulary for search-family endpoint results.
 *
 * @remarks
 * Regex and fixed-string search both need to distinguish true root-local failures from bounded
 * partial-result states. This module is the search-family SSOT for the caller-visible stop reasons
 * that remain non-failure states while still requiring truthful reporting.
 */
export const SEARCH_STOP_REASON_LITERALS = {
  COMPLETION_CONTINUATION_AVAILABLE: "completion_continuation_available",
  EXECUTION_RUNTIME_BUDGET_EXHAUSTED: "execution_runtime_budget_exhausted",
  MAX_RESULTS_LIMIT_REACHED: "max_results_limit_reached",
  PREVIEW_CONTINUATION_AVAILABLE: "preview_continuation_available",
  PREVIEW_LANE_BUDGET_EXHAUSTED: "preview_lane_budget_exhausted",
} as const;

/**
 * Canonical bounded-stop reason values shared by the search family.
 *
 * @remarks
 * Result schemas should consume this tuple instead of re-declaring local enum arrays so the
 * caller-visible stop-state contract remains a family-level single source of truth.
 */
export const SEARCH_STOP_REASON_VALUES = [
  SEARCH_STOP_REASON_LITERALS.COMPLETION_CONTINUATION_AVAILABLE,
  SEARCH_STOP_REASON_LITERALS.EXECUTION_RUNTIME_BUDGET_EXHAUSTED,
  SEARCH_STOP_REASON_LITERALS.MAX_RESULTS_LIMIT_REACHED,
  SEARCH_STOP_REASON_LITERALS.PREVIEW_CONTINUATION_AVAILABLE,
  SEARCH_STOP_REASON_LITERALS.PREVIEW_LANE_BUDGET_EXHAUSTED,
] as const;

/**
 * Canonical bounded-stop reasons shared by the search family.
 */
export type SearchStopReason =
  (typeof SEARCH_STOP_REASON_LITERALS)[keyof typeof SEARCH_STOP_REASON_LITERALS];

/**
 * Shared bounded-stop state carried by one search-family root result.
 */
export interface SearchStopState {
  /**
   * Canonical bounded-stop reason, or `null` when the root completed without an early stop.
   */
  stopReason: SearchStopReason | null;

  /**
   * Caller-visible explanation for the bounded-stop state, or `null` when no early stop occurred.
   */
  stopMessage: string | null;
}

/**
 * Returns the neutral search-family stop state for fully completed roots.
 */
export function createUnstoppedSearchState(): SearchStopState {
  return {
    stopReason: null,
    stopMessage: null,
  };
}

/**
 * Creates one canonical bounded-stop state for the search family.
 *
 * @param stopReason - Canonical bounded-stop reason.
 * @param stopMessage - Caller-visible explanation for the bounded-stop state.
 * @returns Shared stop state for one root result.
 */
export function createSearchStopState(
  stopReason: SearchStopReason,
  stopMessage: string,
): SearchStopState {
  return {
    stopReason,
    stopMessage,
  };
}

/**
 * Creates the bounded-stop state used when the effective search result cap was reached.
 *
 * @param effectiveMaxResults - Effective per-root result cap enforced by the current search flow.
 * @returns Shared stop state for result-cap truncation.
 */
export function createSearchMaxResultsLimitReachedState(
  effectiveMaxResults: number,
): SearchStopState {
  const stopMessage = effectiveMaxResults > 0
    ? `Collected results reached the effective result limit of ${effectiveMaxResults} for this search scope.`
    : "Collected results reached the effective result limit for this search scope.";

  return createSearchStopState(
    SEARCH_STOP_REASON_LITERALS.MAX_RESULTS_LIMIT_REACHED,
    stopMessage,
  );
}

/**
 * Creates the bounded-stop state used when preview-capable continuation still owns unread search data.
 *
 * @returns Shared stop state for resumable preview continuation.
 */
export function createSearchPreviewContinuationState(): SearchStopState {
  return createSearchStopState(
    SEARCH_STOP_REASON_LITERALS.PREVIEW_CONTINUATION_AVAILABLE,
    "Additional matches remain in the persisted continuation frontier for this search scope.",
  );
}
/**
 * Creates the bounded-stop state used when the deeper runtime execution safeguard stopped the search.
 *
 * @param stopMessage - Canonical runtime-budget explanation surfaced by the guardrail layer.
 * @returns Shared stop state for runtime-budget exhaustion.
 */
export function createSearchExecutionRuntimeBudgetState(
  stopMessage: string,
): SearchStopState {
  return createSearchStopState(
    SEARCH_STOP_REASON_LITERALS.EXECUTION_RUNTIME_BUDGET_EXHAUSTED,
    stopMessage,
  );
}

/**
 * Creates the bounded-stop state used when a server-owned `complete-result` pass remains resumable.
 *
 * @returns Shared stop state for bounded completion continuation.
 */
export function createSearchCompletionContinuationState(): SearchStopState {
  return createSearchStopState(
    SEARCH_STOP_REASON_LITERALS.COMPLETION_CONTINUATION_AVAILABLE,
    "Additional matches remain in the persisted completion frontier for this search scope.",
  );
}

/**
 * Creates the bounded-stop state used when the preview-lane byte budget was exhausted.
 *
 * @param stopMessage - Canonical preview-lane explanation surfaced by the admission layer.
 * @returns Shared stop state for preview-lane exhaustion.
 */
export function createSearchPreviewLaneBudgetState(
  stopMessage: string,
): SearchStopState {
  return createSearchStopState(
    SEARCH_STOP_REASON_LITERALS.PREVIEW_LANE_BUDGET_EXHAUSTED,
    stopMessage,
  );
}

/**
 * Checks whether a bounded-stop reason represents the ordinary result-cap limit instead of a deeper
 * partial-execution state.
 *
 * @param stopReason - Shared bounded-stop reason carried by the root result.
 * @returns `true` when the stop reason is the plain effective result limit.
 */
export function isSearchMaxResultsLimitReached(
  stopReason: SearchStopReason | null,
): boolean {
  return stopReason === SEARCH_STOP_REASON_LITERALS.MAX_RESULTS_LIMIT_REACHED;
}

/**
 * Checks whether a search root carries any bounded-stop state.
 *
 * @param stopState - Shared search-family stop state carried by the root result.
 * @returns `true` when the root stopped early for any bounded reason.
 */
export function hasSearchStopState(stopState: SearchStopState): boolean {
  return stopState.stopReason !== null && stopState.stopMessage !== null;
}

/**
 * Formats the canonical caller-visible bounded-stop line for one search-family root result.
 *
 * @param stopState - Shared bounded-stop state carried by the root result.
 * @returns One caller-visible bounded-stop line, or `null` when the root completed normally.
 */
export function formatSearchStopStateLine(stopState: SearchStopState): string | null {
  if (!hasSearchStopState(stopState)) {
    return null;
  }

  return `Search stopped early: ${stopState.stopMessage}`;
}
