/**
 * Mutable aggregate candidate-byte budget state shared across all requested fixed-string roots.
 */
export interface FixedStringSearchAggregateBudgetState {
  /**
   * Aggregate candidate bytes scanned across the current request.
   */
  totalCandidateBytesScanned: number;
}

/**
 * Creates the canonical request-aggregate budget state for one fixed-string request.
 *
 * @returns Fresh aggregate accounting state with zero scanned candidate bytes.
 */
export function createFixedStringSearchAggregateBudgetState(): FixedStringSearchAggregateBudgetState {
  return {
    totalCandidateBytesScanned: 0,
  };
}
