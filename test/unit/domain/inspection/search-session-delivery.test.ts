import { describe, expect, it } from "vitest";

import {
  createEmptySearchDeliveredTotals,
  createSearchSessionDeliverySummary,
  formatSearchCompletionSummaryLine,
  resolveSearchDeliveredTotals,
  SearchSessionDeliverySummarySchema,
  sumSearchDeliveredTotals,
} from "@domain/inspection/search/search-session-delivery";

describe("search-session-delivery", () => {
  it("resolves absent persisted totals to the empty totals at the consumption boundary", () => {
    expect(resolveSearchDeliveredTotals(undefined)).toEqual({
      matchCount: 0,
      locationCount: 0,
    });
    expect(createEmptySearchDeliveredTotals()).toEqual({
      matchCount: 0,
      locationCount: 0,
    });

    const persistedTotals = {
      matchCount: 3,
      locationCount: 2,
    };

    expect(resolveSearchDeliveredTotals(persistedTotals)).toEqual(persistedTotals);
  });

  it("sums delivered totals across passes without mutating the inputs", () => {
    const previousTotals = {
      matchCount: 3,
      locationCount: 2,
    };
    const currentPass = {
      matchCount: 4,
      locationCount: 4,
    };

    expect(sumSearchDeliveredTotals(previousTotals, currentPass)).toEqual({
      matchCount: 7,
      locationCount: 6,
    });
    expect(previousTotals).toEqual({
      matchCount: 3,
      locationCount: 2,
    });
  });

  it("builds the search session delivery summary for base and continuation passes", () => {
    expect(
      createSearchSessionDeliverySummary(
        false,
        createEmptySearchDeliveredTotals(),
        { matchCount: 5, locationCount: 4 },
      ),
    ).toEqual({
      continuationPass: false,
      previouslyDeliveredCount: 0,
      previouslyDeliveredLocationCount: 0,
      sessionTotalCount: 5,
      sessionTotalLocationCount: 4,
    });

    expect(
      createSearchSessionDeliverySummary(
        true,
        { matchCount: 5, locationCount: 4 },
        { matchCount: 2, locationCount: 2 },
      ),
    ).toEqual({
      continuationPass: true,
      previouslyDeliveredCount: 5,
      previouslyDeliveredLocationCount: 4,
      sessionTotalCount: 7,
      sessionTotalLocationCount: 6,
    });
  });

  it("formats the terminal completion summary line with delta and session totals", () => {
    expect(
      formatSearchCompletionSummaryLine(
        "Regex-search",
        1,
        { matchCount: 0, locationCount: 0 },
        {
          continuationPass: true,
          previouslyDeliveredCount: 1,
          previouslyDeliveredLocationCount: 1,
          sessionTotalCount: 1,
          sessionTotalLocationCount: 1,
        },
      ),
    ).toBe(
      "Regex-search completion finished for 1 root: 0 additional matches in 0 locations in this final pass; session total 1 matches in 1 locations (1 already delivered in prior preview-chunk payloads).",
    );

    expect(
      formatSearchCompletionSummaryLine(
        "Fixed-string-search",
        3,
        { matchCount: 2, locationCount: 2 },
        {
          continuationPass: true,
          previouslyDeliveredCount: 5,
          previouslyDeliveredLocationCount: 5,
          sessionTotalCount: 7,
          sessionTotalLocationCount: 7,
        },
      ),
    ).toBe(
      "Fixed-string-search completion finished for 3 roots: 2 additional matches in 2 locations in this final pass; session total 7 matches in 7 locations (5 already delivered in prior preview-chunk payloads).",
    );
  });

  it("validates the search session delivery summary schema surface", () => {
    expect(
      SearchSessionDeliverySummarySchema.safeParse({
        continuationPass: true,
        previouslyDeliveredCount: 5,
        previouslyDeliveredLocationCount: 4,
        sessionTotalCount: 7,
        sessionTotalLocationCount: 6,
      }).success,
    ).toBe(true);
    expect(
      SearchSessionDeliverySummarySchema.safeParse({
        continuationPass: true,
        previouslyDeliveredCount: 5,
        sessionTotalCount: 7,
      }).success,
    ).toBe(false);
  });
});
