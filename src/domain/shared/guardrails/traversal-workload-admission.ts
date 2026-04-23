import {
  buildTraversalNarrowingGuidance,
  type FilesystemPreflightEntry,
  type TraversalPreflightAdmissionEvidence,
} from "./filesystem-preflight";
import type { TraversalCandidateWorkloadEvidence } from "./traversal-candidate-workload";

import { type SearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";

/**
 * Canonical admission outcomes for broad recursive traversal requests.
 */
export const TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES = {
  INLINE: "inline",
  PREVIEW_FIRST: "preview-first",
  COMPLETION_BACKED_REQUIRED: "completion-backed-required",
  NARROWING_REQUIRED: "narrowing-required",
} as const;

/**
 * Canonical lane-local execution-cost models that translate bounded workload probes into
 * conservative inline-admission estimates.
 */
export const TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS = {
  COUNT_PATTERN_AWARE: {
    executionTimeCostMultiplier: 2,
    estimatedPerCandidateFileCostMs: 180,
  },
  COUNT_STREAMING: {
    executionTimeCostMultiplier: 2,
    estimatedPerCandidateFileCostMs: 40,
  },
  DISCOVERY: {
    executionTimeCostMultiplier: 2,
    estimatedPerCandidateFileCostMs: 0,
  },
  LITERAL_SEARCH: {
    executionTimeCostMultiplier: 2,
    estimatedPerCandidateFileCostMs: 500,
  },
  REGEX_SEARCH: {
    executionTimeCostMultiplier: 2,
    estimatedPerCandidateFileCostMs: 650,
  },
} as const;

/**
 * Deterministic admission outcome chosen before broad recursive traversal begins.
 */
export type TraversalWorkloadAdmissionOutcome =
  (typeof TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES)[keyof typeof TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES];

/**
 * Consumer-local capabilities that shape how one endpoint family may react to a broad traversal.
 */
export interface TraversalWorkloadAdmissionConsumerCapabilities {
  /**
   * Exact tool or consumer surface that owns the admission decision.
   */
  toolName: string;

  /**
   * Whether this consumer can surface a preview-first lane without widening its public schema.
   */
  previewFirstSupported: boolean;

  /**
   * Candidate-byte ceiling above which inline execution is no longer appropriate for this consumer.
   */
  inlineCandidateByteBudget?: number | null;

  /**
   * Candidate-file ceiling above which per-file execution fan-out is no longer appropriate for the
   * inline lane of this consumer.
   */
  inlineCandidateFileBudget?: number | null;

  /**
   * Caller-visible text-response ceiling for the inline lane of this consumer.
   */
  inlineTextResponseCapChars?: number | null;

  /**
   * Multiplier that projects bounded probe time into conservative lane-local execution time.
   */
  executionTimeCostMultiplier?: number | null;

  /**
   * Additional conservative per-candidate-file cost in milliseconds for lane-local execution.
   */
  estimatedPerCandidateFileCostMs?: number | null;

  /**
   * Whether this consumer owns a real task-backed execution lane for oversized workloads.
   */
  taskBackedExecutionSupported: boolean;
}

/**
 * Shared input surface for one traversal workload-admission decision.
 */
export interface TraversalWorkloadAdmissionInput {
  /**
   * Caller-supplied root path that anchors the broad traversal workload.
   */
  requestedRoot: string;

  /**
   * Validated root entry returned by the metadata-first preflight layer.
   */
  rootEntry: FilesystemPreflightEntry;

  /**
   * Preflight breadth evidence gathered before recursive traversal begins.
   */
  admissionEvidence: TraversalPreflightAdmissionEvidence | null;

  /**
   * Execution-aware candidate-workload evidence collected before full traversal begins.
   */
  candidateWorkloadEvidence?: TraversalCandidateWorkloadEvidence | null;

  /**
   * Family-local projection of the caller-visible inline text surface.
   */
  projectedInlineTextChars?: number | null;

  /**
   * Shared execution-policy vocabulary derived from runtime capability signals.
   */
  executionPolicy: SearchExecutionPolicy;

  /**
   * Consumer-local lane capabilities used to map broad workloads onto real execution surfaces.
   */
  consumerCapabilities: TraversalWorkloadAdmissionConsumerCapabilities;
}

/**
 * Deterministic admission decision plus caller guidance produced before traversal begins.
 */
export interface TraversalWorkloadAdmissionDecision {
  /**
   * Canonical admission outcome selected for the current workload.
   */
  outcome: TraversalWorkloadAdmissionOutcome;

  /**
   * Deterministic caller guidance that explains the selected outcome.
   */
  guidanceText: string | null;
}

function isWithinInlineAdmissionBand(
  admissionEvidence: TraversalPreflightAdmissionEvidence,
  executionPolicy: SearchExecutionPolicy,
): boolean {
  return (
    admissionEvidence.visitedEntries <= executionPolicy.traversalInlineEntryBudget
    && admissionEvidence.visitedDirectories <= executionPolicy.traversalInlineDirectoryBudget
  );
}

function isWithinPreviewFirstAdmissionBand(
  admissionEvidence: TraversalPreflightAdmissionEvidence,
  executionPolicy: SearchExecutionPolicy,
): boolean {
  return (
    admissionEvidence.visitedEntries <= executionPolicy.traversalPreviewFirstEntryBudget
    && admissionEvidence.visitedDirectories <= executionPolicy.traversalPreviewFirstDirectoryBudget
  );
}

function exceedsInlineCandidateByteBudget(
  input: TraversalWorkloadAdmissionInput,
): boolean {
  const candidateWorkloadEvidence = input.candidateWorkloadEvidence ?? null;
  const inlineCandidateByteBudget = input.consumerCapabilities.inlineCandidateByteBudget ?? null;

  if (candidateWorkloadEvidence === null || inlineCandidateByteBudget === null) {
    return false;
  }

  return (
    candidateWorkloadEvidence.probeTruncated
    || candidateWorkloadEvidence.estimatedCandidateBytes > inlineCandidateByteBudget
  );
}

function exceedsInlineCandidateFileBudget(
  input: TraversalWorkloadAdmissionInput,
): boolean {
  const candidateWorkloadEvidence = input.candidateWorkloadEvidence ?? null;
  const inlineCandidateFileBudget = input.consumerCapabilities.inlineCandidateFileBudget ?? null;

  if (candidateWorkloadEvidence === null || inlineCandidateFileBudget === null) {
    return false;
  }

  return (
    candidateWorkloadEvidence.probeTruncated
    || candidateWorkloadEvidence.matchedCandidateFiles > inlineCandidateFileBudget
  );
}

function estimateInlineExecutionCostMs(
  input: TraversalWorkloadAdmissionInput,
): number | null {
  const candidateWorkloadEvidence = input.candidateWorkloadEvidence ?? null;
  const executionTimeCostMultiplier = input.consumerCapabilities.executionTimeCostMultiplier ?? null;

  if (candidateWorkloadEvidence === null || executionTimeCostMultiplier === null) {
    return null;
  }

  const estimatedPerCandidateFileCostMs =
    input.consumerCapabilities.estimatedPerCandidateFileCostMs ?? 0;

  return Math.ceil(
    candidateWorkloadEvidence.probeElapsedMs * executionTimeCostMultiplier
    + candidateWorkloadEvidence.matchedCandidateFiles * estimatedPerCandidateFileCostMs,
  );
}

function exceedsInlineExecutionTimeBudget(
  input: TraversalWorkloadAdmissionInput,
): boolean {
  const estimatedInlineExecutionCostMs = estimateInlineExecutionCostMs(input);

  if (estimatedInlineExecutionCostMs === null) {
    return false;
  }

  return estimatedInlineExecutionCostMs > input.executionPolicy.traversalInlineExecutionBudgetMs;
}

function exceedsInlineResponseTextBudget(
  input: TraversalWorkloadAdmissionInput,
): boolean {
  const projectedInlineTextChars = input.projectedInlineTextChars ?? null;
  const inlineTextResponseCapChars = input.consumerCapabilities.inlineTextResponseCapChars ?? null;

  if (projectedInlineTextChars === null || inlineTextResponseCapChars === null) {
    return false;
  }

  return projectedInlineTextChars > inlineTextResponseCapChars;
}

function buildPreviewFirstAdmissionGuidance(
  requestedRoot: string,
  toolName: string,
): string {
  return `Broad recursive traversal for root '${requestedRoot}' is being admitted in preview-first mode for ${toolName}. The bounded preview lane will stop before the deeper runtime safeguard becomes the dominant caller-facing control.`;
}

function buildPreviewFirstResponseBudgetGuidance(
  requestedRoot: string,
  toolName: string,
): string {
  return `Projected caller-visible inline output for root '${requestedRoot}' exceeds the bounded inline response surface for ${toolName}. The request is being admitted in preview-first mode so structured data can remain authoritative while text delivery stays compact.`;
}

function buildTaskBackedRequiredGuidance(
  requestedRoot: string,
  toolName: string,
): string {
  return `Broad recursive traversal for root '${requestedRoot}' exceeds the inline and preview-first admission bands for ${toolName}. A real completion-backed execution lane is required before traversal begins.`;
}

function buildNarrowingRequiredGuidance(
  requestedRoot: string,
  toolName: string,
  admissionEvidence: TraversalPreflightAdmissionEvidence,
): string {
  return `${buildTraversalNarrowingGuidance(requestedRoot)} Broad recursive traversal for ${toolName} exceeded the inline admission band at ${admissionEvidence.visitedEntries} visited entries and ${admissionEvidence.visitedDirectories} visited directories before execution began, and this surface has no task-backed execution lane.`;
}

/**
 * Builds canonical caller guidance when a preview-first traversal lane stops before a full
 * recursive scan completes.
 *
 * @param requestedRoot - Caller-supplied root path that should be narrowed before retry.
 * @param toolName - Exact consumer surface that exhausted the bounded preview lane.
 * @returns Deterministic English guidance for preview-lane exhaustion.
 */
export function buildTraversalPreviewFirstTruncationGuidance(
  requestedRoot: string,
  toolName: string,
): string {
  return `Preview-first traversal for root '${requestedRoot}' stopped after the bounded preview lane for ${toolName} was exhausted before a full recursive scan completed. ${buildTraversalNarrowingGuidance(requestedRoot)}`;
}

/**
 * Resolves the shared admission-to-execution decision for one broad recursive workload.
 *
 * @param input - Validated root metadata, preflight breadth evidence, runtime policy vocabulary,
 * and consumer capabilities for the current traversal request.
 * @returns One deterministic admission outcome plus caller guidance when inline execution should
 * not proceed.
 */
export function resolveTraversalWorkloadAdmissionDecision(
  input: TraversalWorkloadAdmissionInput,
): TraversalWorkloadAdmissionDecision {
  const inlineResponseTextBudgetExceeded = exceedsInlineResponseTextBudget(input);

  if (input.rootEntry.type !== "directory" || input.admissionEvidence === null) {
    if (inlineResponseTextBudgetExceeded && input.consumerCapabilities.previewFirstSupported) {
      return {
        outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST,
        guidanceText: buildPreviewFirstResponseBudgetGuidance(
          input.requestedRoot,
          input.consumerCapabilities.toolName,
        ),
      };
    }

    if (inlineResponseTextBudgetExceeded && input.consumerCapabilities.taskBackedExecutionSupported) {
      return {
        outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
        guidanceText: buildTaskBackedRequiredGuidance(
          input.requestedRoot,
          input.consumerCapabilities.toolName,
        ),
      };
    }

    return {
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.INLINE,
      guidanceText: null,
    };
  }

  const inlineCandidateBudgetExceeded = exceedsInlineCandidateByteBudget(input);
  const inlineCandidateFileBudgetExceeded = exceedsInlineCandidateFileBudget(input);
  const inlineExecutionTimeBudgetExceeded = exceedsInlineExecutionTimeBudget(input);

  if (
    !inlineCandidateBudgetExceeded
    && !inlineCandidateFileBudgetExceeded
    && !inlineExecutionTimeBudgetExceeded
    && !inlineResponseTextBudgetExceeded
    && isWithinInlineAdmissionBand(input.admissionEvidence, input.executionPolicy)
  ) {
    return {
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.INLINE,
      guidanceText: null,
    };
  }

  if (
    input.consumerCapabilities.previewFirstSupported
    && (
      inlineCandidateBudgetExceeded
      || inlineCandidateFileBudgetExceeded
      || inlineExecutionTimeBudgetExceeded
      || inlineResponseTextBudgetExceeded
      || isWithinPreviewFirstAdmissionBand(input.admissionEvidence, input.executionPolicy)
    )
  ) {
    return {
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST,
      guidanceText: inlineResponseTextBudgetExceeded
        ? buildPreviewFirstResponseBudgetGuidance(
            input.requestedRoot,
            input.consumerCapabilities.toolName,
          )
        : buildPreviewFirstAdmissionGuidance(
            input.requestedRoot,
            input.consumerCapabilities.toolName,
          ),
    };
  }

  if (input.consumerCapabilities.taskBackedExecutionSupported) {
    return {
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
      guidanceText: buildTaskBackedRequiredGuidance(
        input.requestedRoot,
        input.consumerCapabilities.toolName,
      ),
    };
  }

  return {
    outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.NARROWING_REQUIRED,
    guidanceText: buildNarrowingRequiredGuidance(
      input.requestedRoot,
      input.consumerCapabilities.toolName,
      input.admissionEvidence,
    ),
  };
}
