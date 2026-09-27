import { describe, expect, it } from "vitest";

import {
  createSearchCompletionContinuationState,
  createSearchExecutionRuntimeBudgetState,
  createSearchMaxResultsLimitReachedState,
  createSearchPreviewContinuationState,
  createSearchPreviewLaneBudgetState,
  createSearchStopState,
  createUnstoppedSearchState,
  formatSearchStopStateLine,
  hasSearchStopState,
  isSearchMaxResultsLimitReached,
  SEARCH_STOP_REASON_LITERALS,
  SEARCH_STOP_REASON_VALUES,
} from "@domain/inspection/search/search-stop-state";

describe("search stop state", () => {
  it("exposes the canonical stop-reason value tuple in the declared order", () => {
    expect(SEARCH_STOP_REASON_VALUES).toEqual([
      "completion_continuation_available",
      "execution_runtime_budget_exhausted",
      "max_results_limit_reached",
      "preview_continuation_available",
      "preview_lane_budget_exhausted",
    ]);
  });

  it("creates the neutral unstopped state for fully completed roots", () => {
    const state = createUnstoppedSearchState();

    expect(state).toEqual({ stopMessage: null, stopReason: null });
    expect(hasSearchStopState(state)).toBe(false);
    expect(formatSearchStopStateLine(state)).toBeNull();
  });

  it("creates canonical stop states for every bounded stop reason", () => {
    expect(
      createSearchStopState(SEARCH_STOP_REASON_LITERALS.PREVIEW_CONTINUATION_AVAILABLE, "more"),
    ).toEqual({
      stopMessage: "more",
      stopReason: "preview_continuation_available",
    });
    expect(createSearchExecutionRuntimeBudgetState("runtime exhausted").stopReason).toBe(
      "execution_runtime_budget_exhausted",
    );
    expect(createSearchPreviewLaneBudgetState("preview exhausted").stopReason).toBe(
      "preview_lane_budget_exhausted",
    );
    expect(createSearchPreviewContinuationState().stopReason).toBe(
      "preview_continuation_available",
    );
    expect(createSearchCompletionContinuationState().stopReason).toBe(
      "completion_continuation_available",
    );
  });

  it("formats the result-cap stop message with and without the numeric limit", () => {
    expect(createSearchMaxResultsLimitReachedState(400).stopMessage).toBe(
      "Collected results reached the effective result limit of 400 for this search scope.",
    );
    expect(createSearchMaxResultsLimitReachedState(0).stopMessage).toBe(
      "Collected results reached the effective result limit for this search scope.",
    );
  });

  it("formats the caller-visible stop line only for stopped roots", () => {
    const stopped = createSearchMaxResultsLimitReachedState(400);

    expect(hasSearchStopState(stopped)).toBe(true);
    expect(formatSearchStopStateLine(stopped)).toBe(
      "Search stopped early: Collected results reached the effective result limit of 400 for this search scope.",
    );
    expect(isSearchMaxResultsLimitReached(stopped.stopReason)).toBe(true);
    expect(isSearchMaxResultsLimitReached(null)).toBe(false);
    expect(isSearchMaxResultsLimitReached(stopped.stopReason)).toBe(true);
  });
});
