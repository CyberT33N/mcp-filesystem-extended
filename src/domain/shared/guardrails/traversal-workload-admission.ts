import {
  buildTraversalNarrowingGuidance,
  type FilesystemPreflightEntry,
  type TraversalPreflightAdmissionEvidence,
} from "./filesystem-preflight";

import { type SearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";

/**
 * Canonical admission outcomes for broad recursive traversal requests.
 */
export const TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES = {
  INLINE: "inline",
  PREVIEW_FIRST: "preview-first",
  TASK_BACKED_REQUIRED: "task-backed-required",
  NARROWING_REQUIRED: "narrowing-required",
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

function buildTaskBackedRequiredGuidance(
  requestedRoot: string,
  toolName: string,
): string {
  return `Broad recursive traversal for root '${requestedRoot}' exceeds the inline and preview-first admission bands for ${toolName}. A real task-backed execution lane is required before traversal begins.`;
}

function buildNarrowingRequiredGuidance(
  requestedRoot: string,
  toolName: string,
  admissionEvidence: TraversalPreflightAdmissionEvidence,
): string {
  return `${buildTraversalNarrowingGuidance(requestedRoot)} Broad recursive traversal for ${toolName} exceeded the inline admission band at ${admissionEvidence.visitedEntries} visited entries and ${admissionEvidence.visitedDirectories} visited directories before execution began, and this surface has no task-backed execution lane.`;
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
  if (input.rootEntry.type !== "directory" || input.admissionEvidence === null) {
    return {
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.INLINE,
      guidanceText: null,
    };
  }

  if (isWithinInlineAdmissionBand(input.admissionEvidence, input.executionPolicy)) {
    return {
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.INLINE,
      guidanceText: null,
    };
  }

  if (
    input.consumerCapabilities.previewFirstSupported
    && isWithinPreviewFirstAdmissionBand(input.admissionEvidence, input.executionPolicy)
  ) {
    return {
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST,
      guidanceText: `Broad recursive traversal for root '${input.requestedRoot}' is being admitted in preview-first mode before ${input.consumerCapabilities.toolName} enters its traversal loop.`,
    };
  }

  if (input.consumerCapabilities.taskBackedExecutionSupported) {
    return {
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.TASK_BACKED_REQUIRED,
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
