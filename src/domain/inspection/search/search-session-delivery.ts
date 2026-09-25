import { z } from "zod";

import {
  InspectionSessionDeliverySummarySchema,
  type InspectionSessionDeliverySummary,
} from "@domain/shared/resume/inspection-resume-contract";

/**
 * Session-cumulative delivered-result totals persisted inside a search-family continuation state.
 *
 * @remarks
 * The totals live at the top level of the persisted continuation state — not inside per-root
 * traversal frames — so they survive roots that complete while sibling roots still own pending
 * frontier work.
 */
export interface SearchDeliveredTotals {
  /**
   * Match occurrences already delivered to the caller in prior passes of the session.
   */
  matchCount: number;

  /**
   * Match locations already delivered to the caller in prior passes of the session.
   */
  locationCount: number;
}

/**
 * Session-cumulative delivery summary for the search family.
 *
 * @remarks
 * Extends the shared delivery summary with the location dimension because the public search
 * contract exposes both `totalMatches` and `totalLocations`.
 */
export interface SearchSessionDeliverySummary extends InspectionSessionDeliverySummary {
  /**
   * Match locations already delivered to the caller in prior passes of the same session.
   */
  previouslyDeliveredLocationCount: number;

  /**
   * Session-cumulative match locations including the current pass.
   */
  sessionTotalLocationCount: number;
}

/**
 * Zod schema for the search-family session delivery summary surface.
 *
 * @remarks
 * Extends the shared delivery summary schema so both search endpoint result schemas embed the
 * same machine-readable session truth without re-declaring the base fields.
 */
export const SearchSessionDeliverySummarySchema = InspectionSessionDeliverySummarySchema.extend({
  previouslyDeliveredLocationCount: z.number(),
  sessionTotalLocationCount: z.number(),
});

/**
 * Returns the zero-valued delivered totals used before any session pass has delivered results.
 *
 * @returns Empty delivered totals.
 */
export function createEmptySearchDeliveredTotals(): SearchDeliveredTotals {
  return {
    matchCount: 0,
    locationCount: 0,
  };
}

/**
 * Normalizes the persisted delivered totals of a search-family continuation state.
 *
 * @remarks
 * This is the boundary-owned normalization point for sessions persisted before the delivered
 * totals existed: their absence resolves to the empty totals instead of a guessed value.
 *
 * @param persistedTotals - Delivered totals read from the persisted continuation state.
 * @returns The persisted totals, or empty totals when the persisted state predates the field.
 */
export function resolveSearchDeliveredTotals(
  persistedTotals: SearchDeliveredTotals | undefined,
): SearchDeliveredTotals {
  return persistedTotals ?? createEmptySearchDeliveredTotals();
}

/**
 * Adds the current pass delivery to the session-cumulative delivered totals.
 *
 * @param previousTotals - Totals delivered by all prior passes of the session.
 * @param currentPass - Totals delivered by the current pass.
 * @returns The summed session-cumulative totals.
 */
export function sumSearchDeliveredTotals(
  previousTotals: SearchDeliveredTotals,
  currentPass: SearchDeliveredTotals,
): SearchDeliveredTotals {
  return {
    matchCount: previousTotals.matchCount + currentPass.matchCount,
    locationCount: previousTotals.locationCount + currentPass.locationCount,
  };
}

/**
 * Builds the search-family session delivery summary for one inspection response.
 *
 * @param continuationPass - Whether the current response continues a persisted session.
 * @param previouslyDelivered - Totals delivered by all prior passes of the session.
 * @param currentPass - Totals delivered by the current pass.
 * @returns Session delivery summary with match and location dimensions.
 */
export function createSearchSessionDeliverySummary(
  continuationPass: boolean,
  previouslyDelivered: SearchDeliveredTotals,
  currentPass: SearchDeliveredTotals,
): SearchSessionDeliverySummary {
  const sessionTotals = sumSearchDeliveredTotals(previouslyDelivered, currentPass);

  return {
    continuationPass,
    previouslyDeliveredCount: previouslyDelivered.matchCount,
    previouslyDeliveredLocationCount: previouslyDelivered.locationCount,
    sessionTotalCount: sessionTotals.matchCount,
    sessionTotalLocationCount: sessionTotals.locationCount,
  };
}

/**
 * Formats the canonical search-family terminal completion summary line.
 *
 * @param familyLabel - Human-readable endpoint family label (for example `Regex-search`).
 * @param rootCount - Number of roots covered by the terminal pass.
 * @param currentPass - Totals delivered by the terminal pass itself.
 * @param sessionDelivery - Session-cumulative delivery summary of the completed session.
 * @returns One caller-visible completion summary line with delta and session totals.
 */
export function formatSearchCompletionSummaryLine(
  familyLabel: string,
  rootCount: number,
  currentPass: SearchDeliveredTotals,
  sessionDelivery: SearchSessionDeliverySummary,
): string {
  const rootLabel = rootCount === 1 ? "root" : "roots";

  return `${familyLabel} completion finished for ${rootCount} ${rootLabel}: ${currentPass.matchCount} additional matches in ${currentPass.locationCount} locations in this final pass; session total ${sessionDelivery.sessionTotalCount} matches in ${sessionDelivery.sessionTotalLocationCount} locations (${sessionDelivery.previouslyDeliveredCount} already delivered in prior preview-chunk payloads).`;
}
