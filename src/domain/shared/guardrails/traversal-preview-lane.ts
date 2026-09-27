import type { SearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";

import {
  buildTraversalPreviewFirstTruncationGuidance,
  TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES,
  type TraversalWorkloadAdmissionDecision,
} from "./traversal-workload-admission";
import type { TraversalRuntimeBudgetLimits } from "./traversal-runtime-budget";

/**
 * Inactive shared execution plan for the bounded preview-first traversal lane.
 *
 * @remarks
 * Non-preview admissions carry no preview-lane budgets; the null-valued variant keeps that
 * inactivity explicit at the type level so consumers never defend against absent budgets.
 */
export interface InactiveTraversalPreviewLanePlan {
  /**
   * Always `null`: the inactive lane carries no candidate-byte ceiling.
   */
  candidateByteBudget: null;

  /**
   * Always `null`: the inactive lane carries no caller guidance.
   */
  guidanceText: null;

  /**
   * Always `null`: the inactive lane carries no traversal-runtime ceilings.
   */
  runtimeBudgetLimits: null;
}

/**
 * Active shared execution plan for the bounded preview-first traversal lane.
 *
 * @remarks
 * Preview-first admissions always carry a concrete byte ceiling, caller guidance, and runtime
 * ceilings by construction, so consumers can narrow on any one of them.
 */
export interface ActiveTraversalPreviewLanePlan {
  /**
   * Candidate-byte ceiling that keeps the preview lane below the broader search hard gap.
   */
  candidateByteBudget: number;

  /**
   * Canonical caller guidance emitted when the preview lane stops before a full traversal completes.
   */
  guidanceText: string;

  /**
   * Traversal-runtime ceilings that keep preview-first execution below the deeper emergency safeguard.
   */
  runtimeBudgetLimits: TraversalRuntimeBudgetLimits;
}

/**
 * Shared execution plan for the bounded preview-first traversal lane.
 */
export type TraversalPreviewLanePlan =
  | InactiveTraversalPreviewLanePlan
  | ActiveTraversalPreviewLanePlan;

/**
 * Resolves the bounded preview-first execution plan for one traversal admission decision.
 *
 * @param requestedRoot - Caller-supplied root path that anchors the traversal.
 * @param toolName - Exact tool or consumer surface that owns the preview lane.
 * @param admissionDecision - Shared admission decision produced before traversal begins.
 * @param executionPolicy - Shared runtime execution policy for the current request.
 * @param previewCandidateByteBudget - Consumer-specific candidate-byte budget for the preview lane.
 * @returns A bounded preview-lane plan when preview-first admission is active; otherwise null budgets and guidance.
 */
export function resolveTraversalPreviewLanePlan(
  requestedRoot: string,
  toolName: string,
  admissionDecision: TraversalWorkloadAdmissionDecision,
  executionPolicy: SearchExecutionPolicy,
  previewCandidateByteBudget: number,
): TraversalPreviewLanePlan {
  if (admissionDecision.outcome !== TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST) {
    return {
      candidateByteBudget: null,
      guidanceText: null,
      runtimeBudgetLimits: null,
    };
  }

  return {
    candidateByteBudget: previewCandidateByteBudget,
    guidanceText: buildTraversalPreviewFirstTruncationGuidance(requestedRoot, toolName),
    runtimeBudgetLimits: {
      maxVisitedEntries: executionPolicy.traversalPreviewExecutionEntryBudget,
      maxVisitedDirectories: executionPolicy.traversalPreviewExecutionDirectoryBudget,
      softTimeBudgetMs: executionPolicy.traversalPreviewExecutionTimeBudgetMs,
    },
  };
}

/**
 * Checks whether the next candidate file would exhaust the bounded preview-first lane.
 *
 * @param currentAggregateCandidateBytes - Candidate bytes already consumed by the current request.
 * @param nextCandidateBytes - Candidate bytes required for the next file.
 * @param previewLanePlan - Active preview-lane execution plan for the current root.
 * @returns `true` when the next file would exceed the preview-lane byte budget.
 */
export function shouldStopTraversalPreviewLane(
  currentAggregateCandidateBytes: number,
  nextCandidateBytes: number,
  previewLanePlan: ActiveTraversalPreviewLanePlan,
): boolean {
  return currentAggregateCandidateBytes + nextCandidateBytes > previewLanePlan.candidateByteBudget;
}
