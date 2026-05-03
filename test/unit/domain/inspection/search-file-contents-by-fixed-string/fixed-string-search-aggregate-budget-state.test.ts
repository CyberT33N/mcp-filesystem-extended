import { describe, expect, it } from "vitest";

import { createFixedStringSearchAggregateBudgetState } from "@domain/inspection/search-file-contents-by-fixed-string/fixed-string-search-aggregate-budget-state";

/**
 * Non-zero byte count used to prove that aggregate budget states are not shared across calls.
 */
const NON_ZERO_SCANNED_BYTES = 512;

describe("createFixedStringSearchAggregateBudgetState", () => {
  it("creates the canonical zeroed aggregate budget state", () => {
    expect(createFixedStringSearchAggregateBudgetState()).toEqual({
      totalCandidateBytesScanned: 0,
    });
  });

  it("returns a fresh aggregate budget state for each request", () => {
    const firstState = createFixedStringSearchAggregateBudgetState();
    const secondState = createFixedStringSearchAggregateBudgetState();

    firstState.totalCandidateBytesScanned = NON_ZERO_SCANNED_BYTES;

    expect(secondState).toEqual({
      totalCandidateBytesScanned: 0,
    });
  });
});
