import fs from "fs/promises";
import path from "path";

import {
  assertTraversalRuntimeBudget,
  createTraversalRuntimeBudgetState,
  isTraversalRuntimeBudgetExceededError,
  recordTraversalDirectoryVisit,
  recordTraversalEntryVisit,
  type TraversalRuntimeBudgetLimits,
} from "./traversal-runtime-budget";
import {
  shouldExcludeTraversalScopePath,
  shouldTraverseTraversalScopeDirectoryPath,
  type TraversalScopePolicyResolution,
} from "./traversal-scope-policy";

const TRAVERSAL_CANDIDATE_WORKLOAD_PROBE_TOOL_NAME = "traversal_candidate_workload_probe";

/**
 * Shared candidate-workload evidence collected before a recursive search lane begins full execution.
 */
export interface TraversalCandidateWorkloadEvidence {
  /**
   * Aggregate candidate bytes observed by the bounded workload probe.
   */
  estimatedCandidateBytes: number;

  /**
   * Number of candidate files that matched the lane-specific file filter during the probe.
   */
  matchedCandidateFiles: number;

  /**
   * Projected caller-visible inline text characters derived from the bounded probe when a family
   * supplies a response-surface estimator.
   */
  estimatedResponseChars: number | null;

  /**
   * Wall-clock time spent by the bounded candidate-workload probe.
   */
  probeElapsedMs: number;

  /**
   * Indicates whether the bounded probe stopped before the full candidate surface was exhausted.
   */
  probeTruncated: boolean;
}

/**
 * Input contract for one bounded traversal candidate-workload probe.
 */
export interface CollectTraversalCandidateWorkloadEvidenceInput {
  /**
   * Validated absolute root path that anchors the bounded candidate-workload probe.
   */
  validRootPath: string;

  /**
   * Traversal-scope policy already resolved for the requested root.
   */
  traversalScopePolicyResolution: TraversalScopePolicyResolution;

  /**
   * Bounded runtime limits that keep the candidate-workload probe below the deeper emergency safeguard.
   */
  runtimeBudgetLimits: TraversalRuntimeBudgetLimits;

  /**
   * Candidate-byte ceiling whose overflow proves that inline execution is no longer appropriate.
   */
  inlineCandidateByteBudget?: number | null;

  /**
   * Lane-specific file matcher applied to candidate paths relative to the requested root.
   */
  fileMatcher: (candidateRelativePath: string) => boolean;

  /**
   * Optional family-local response-surface estimator evaluated during the bounded probe.
   */
  responseSurfaceEstimator?: {
    shouldCountEntry: (candidateRelativePath: string, entry: import("fs").Dirent<string>) => boolean;
    estimateEntryResponseChars: (candidateRelativePath: string, entry: import("fs").Dirent<string>) => number;
  } | null;
}

/**
 * Collects bounded candidate-workload evidence before a recursive search lane begins full execution.
 *
 * @param input - Validated root path, traversal policy, runtime limits, inline byte budget, and lane-specific file matcher.
 * @returns Candidate-byte, candidate-file, and truncation evidence for execution-aware admission.
 */
export async function collectTraversalCandidateWorkloadEvidence(
  input: CollectTraversalCandidateWorkloadEvidenceInput,
): Promise<TraversalCandidateWorkloadEvidence> {
  const startedAtMs = Date.now();
  const traversalRuntimeBudgetState = createTraversalRuntimeBudgetState();
  const responseSurfaceEstimator = input.responseSurfaceEstimator ?? null;
  let estimatedCandidateBytes = 0;
  let matchedCandidateFiles = 0;
  let estimatedResponseChars = responseSurfaceEstimator === null ? null : 0;
  let probeTruncated = false;

  async function collectDirectory(
    directoryPath: string,
    currentRelativePath: string,
  ): Promise<void> {
    if (probeTruncated) {
      return;
    }

    recordTraversalDirectoryVisit(traversalRuntimeBudgetState);

    try {
      assertTraversalRuntimeBudget(
        TRAVERSAL_CANDIDATE_WORKLOAD_PROBE_TOOL_NAME,
        traversalRuntimeBudgetState,
        Date.now(),
        undefined,
        input.runtimeBudgetLimits,
      );
    } catch (error) {
      if (isTraversalRuntimeBudgetExceededError(error)) {
        probeTruncated = true;
        return;
      }

      throw error;
    }

    let entries: import("fs").Dirent<string>[];

    try {
      entries = await fs.readdir(directoryPath, { withFileTypes: true });
    } catch {
      probeTruncated = true;
      return;
    }

    for (const entry of entries) {
      if (probeTruncated) {
        break;
      }

      recordTraversalEntryVisit(traversalRuntimeBudgetState);

      try {
        assertTraversalRuntimeBudget(
          TRAVERSAL_CANDIDATE_WORKLOAD_PROBE_TOOL_NAME,
          traversalRuntimeBudgetState,
          Date.now(),
          undefined,
          input.runtimeBudgetLimits,
        );
      } catch (error) {
        if (isTraversalRuntimeBudgetExceededError(error)) {
          probeTruncated = true;
          break;
        }

        throw error;
      }

      const rawRelativePath = currentRelativePath === ""
        ? entry.name
        : path.join(currentRelativePath, entry.name);
      const candidateRelativePath = rawRelativePath.split(path.sep).join("/");
      const shouldTraverseExcludedDirectory = entry.isDirectory()
        && shouldTraverseTraversalScopeDirectoryPath(
          candidateRelativePath,
          input.traversalScopePolicyResolution,
        );

      if (
        shouldExcludeTraversalScopePath(candidateRelativePath, input.traversalScopePolicyResolution)
        && !shouldTraverseExcludedDirectory
      ) {
        continue;
      }

      if (
        responseSurfaceEstimator !== null
        && responseSurfaceEstimator.shouldCountEntry(candidateRelativePath, entry)
      ) {
        estimatedResponseChars =
          (estimatedResponseChars ?? 0)
          + responseSurfaceEstimator.estimateEntryResponseChars(candidateRelativePath, entry);
      }

      const candidateAbsolutePath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        await collectDirectory(candidateAbsolutePath, rawRelativePath);
        continue;
      }

      if (!entry.isFile() || !input.fileMatcher(candidateRelativePath)) {
        continue;
      }

      let candidateStats: import("fs").Stats;

      try {
        candidateStats = await fs.stat(candidateAbsolutePath);
      } catch {
        probeTruncated = true;
        break;
      }

      estimatedCandidateBytes += candidateStats.size;
      matchedCandidateFiles += 1;

      const inlineCandidateByteBudget = input.inlineCandidateByteBudget ?? null;

      if (
        inlineCandidateByteBudget !== null
        && estimatedCandidateBytes > inlineCandidateByteBudget
      ) {
        probeTruncated = true;
        break;
      }
    }
  }

  await collectDirectory(input.validRootPath, "");

  return {
    estimatedCandidateBytes,
    matchedCandidateFiles,
    estimatedResponseChars,
    probeElapsedMs: Date.now() - startedAtMs,
    probeTruncated,
  };
}
