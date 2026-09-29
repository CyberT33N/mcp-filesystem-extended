/**
 * Canonical fail-closed reconciliation statuses for preview-family resume sessions.
 *
 * @remarks
 * A pass is `reconciled` only when the traversal frontier and the delivery accounting agree with
 * the payload that pass actually delivered. Any divergence must close the session truthfully and
 * must never be framed as a completed traversal.
 */
export const INSPECTION_RESUME_FRONTIER_RECONCILIATION_STATUSES = {
  RECONCILED: "reconciled",
  DIVERGED: "diverged",
} as const;

/**
 * Fail-closed reconciliation status of one preview-family delivery pass.
 */
export type InspectionResumeFrontierReconciliationStatus =
  (typeof INSPECTION_RESUME_FRONTIER_RECONCILIATION_STATUSES)[keyof typeof INSPECTION_RESUME_FRONTIER_RECONCILIATION_STATUSES];

/**
 * One traversal-frontier directory frame that was discarded without being delivered.
 */
export interface InspectionResumeFrontierDiscard {
  /**
   * Requested root path that owns the discarded directory frame.
   */
  requestedPath: string;

  /**
   * Root-relative directory path whose traversal frame was discarded.
   */
  directoryRelativePath: string;
}

/**
 * Evidence input for the fail-closed frontier reconciliation of one preview-family pass.
 */
export interface InspectionResumeFrontierReconciliationInput {
  /**
   * Result units delivered by all prior passes of the session, as persisted in the resume state.
   */
  previouslyDeliveredCount: number;

  /**
   * Result units delivered by the current pass payload.
   */
  currentPassDeliveredCount: number;

  /**
   * Session-cumulative total asserted for the current response.
   */
  sessionTotalCount: number;

  /**
   * Directory frames discarded without delivery during the current pass.
   */
  discardedDirectories: InspectionResumeFrontierDiscard[];
}

/**
 * Reconciliation verdict for one preview-family delivery pass.
 */
export interface InspectionResumeFrontierReconciliationVerdict {
  /**
   * Whether the pass reconciled truthfully or diverged from the delivered payload.
   */
  status: InspectionResumeFrontierReconciliationStatus;

  /**
   * Machine-readable divergence reason when the pass diverged; null when reconciled.
   */
  divergenceReason: string | null;

  /**
   * Directory frames discarded without delivery during the current pass (empty when reconciled).
   */
  discardedDirectories: InspectionResumeFrontierDiscard[];
}

/**
 * Reconciles the traversal frontier and the delivery accounting of one preview-family pass against
 * the payload it actually delivered.
 *
 * @remarks
 * This is the shared fail-closed auditor behind the truthful terminal framing rule: a session may
 * close only when no frontier unit was discarded without delivery and the session-cumulative
 * accounting equals the previously delivered units plus the currently delivered units. The verdict
 * never reconstructs payloads; it audits the evidence surfaces the executing endpoint already owns,
 * so a future break of the commit-delivery coupling fires here instead of shipping a false
 * completion framing.
 *
 * @param input - Per-pass delivery and frontier-discard evidence.
 * @returns The reconciliation verdict for the current pass.
 */
export function reconcileInspectionResumeFrontierTruthfulness(
  input: InspectionResumeFrontierReconciliationInput,
): InspectionResumeFrontierReconciliationVerdict {
  const divergenceReasons: string[] = [];

  if (input.discardedDirectories.length > 0) {
    divergenceReasons.push(
      `${input.discardedDirectories.length} ${input.discardedDirectories.length === 1 ? "directory" : "directories"} discarded from the traversal frontier without delivery`,
    );
  }

  const expectedSessionTotalCount =
    input.previouslyDeliveredCount + input.currentPassDeliveredCount;

  if (input.sessionTotalCount !== expectedSessionTotalCount) {
    divergenceReasons.push(
      `delivery accounting divergence: session total ${input.sessionTotalCount} does not equal previously delivered ${input.previouslyDeliveredCount} plus current pass ${input.currentPassDeliveredCount}`,
    );
  }

  if (divergenceReasons.length === 0) {
    return {
      status: INSPECTION_RESUME_FRONTIER_RECONCILIATION_STATUSES.RECONCILED,
      divergenceReason: null,
      discardedDirectories: [],
    };
  }

  return {
    status: INSPECTION_RESUME_FRONTIER_RECONCILIATION_STATUSES.DIVERGED,
    divergenceReason: divergenceReasons.join("; "),
    discardedDirectories: [...input.discardedDirectories],
  };
}
