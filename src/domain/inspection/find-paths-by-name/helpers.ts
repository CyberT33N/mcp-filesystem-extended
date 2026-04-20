import fs from "fs/promises";
import path from "path";
import {
  buildTraversalNarrowingGuidance,
  resolveTraversalPreflightContext,
} from "@domain/shared/guardrails/filesystem-preflight";
import {
  TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS,
  resolveTraversalWorkloadAdmissionDecision,
  TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES,
} from "@domain/shared/guardrails/traversal-workload-admission";
import { collectTraversalCandidateWorkloadEvidence } from "@domain/shared/guardrails/traversal-candidate-workload";
import {
  assertTraversalRuntimeBudget,
  createTraversalRuntimeBudgetState,
  isTraversalRuntimeBudgetExceededError,
  recordTraversalDirectoryVisit,
  recordTraversalEntryVisit,
} from "@domain/shared/guardrails/traversal-runtime-budget";
import {
  shouldExcludeTraversalScopePath,
  shouldTraverseTraversalScopeDirectoryPath,
} from "@domain/shared/guardrails/traversal-scope-policy";
import { resolveSearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";
import { validatePath } from "@infrastructure/filesystem/path-guard";
import { detectIoCapabilityProfile } from "@infrastructure/runtime/io-capability-detector";

/**
 * Describes the helper-level result for one name-search traversal.
 *
 * @remarks
 * This contract preserves collected matches and truncation state so callers can
 * build structured or formatted discovery output without recomputing traversal
 * breadth decisions.
 */
export interface SearchFilesResult {
  matches: string[];
  truncated: boolean;
}

/**
 * Traverses one validated root and collects case-insensitive name matches.
 *
 * @remarks
 * The helper normalizes exclude-pattern handling, enforces path validation on
 * every visited entry, and stops traversal once the effective result ceiling is
 * reached so discovery output cannot grow without a bounded truncation signal.
 *
 * @param rootPath - Validated root path used as the traversal anchor.
 * @param pattern - Case-insensitive substring matched against entry names.
 * @param excludePatterns - Glob-like exclusion patterns applied to relative paths.
 * @param includeExcludedGlobs - Explicit descendant re-include globs that may reopen excluded subtrees.
 * @param respectGitIgnore - Indicates whether optional root-local `.gitignore` enrichment should participate in traversal.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @param maxResults - Maximum number of collected matches before truncation.
 * @returns Helper-level matches and truncation state for the traversal.
 */
export async function searchFiles(
  rootPath: string,
  pattern: string,
  excludePatterns: string[] = [],
  includeExcludedGlobs: string[] = [],
  respectGitIgnore: boolean,
  allowedDirectories: string[],
  maxResults: number,
): Promise<SearchFilesResult> {
  const results: string[] = [];
  let truncated = false;
  const traversalPreflightContext = await resolveTraversalPreflightContext(
    "find_paths_by_name",
    rootPath,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    allowedDirectories,
    ["directory"],
  );
  const executionPolicy = resolveSearchExecutionPolicy(detectIoCapabilityProfile());
  const candidateWorkloadEvidence = await collectTraversalCandidateWorkloadEvidence({
    validRootPath: traversalPreflightContext.rootEntry.validPath,
    traversalScopePolicyResolution: traversalPreflightContext.traversalScopePolicyResolution,
    runtimeBudgetLimits: {
      maxVisitedEntries: executionPolicy.traversalPreviewExecutionEntryBudget,
      maxVisitedDirectories: executionPolicy.traversalPreviewExecutionDirectoryBudget,
      softTimeBudgetMs: executionPolicy.traversalPreviewExecutionTimeBudgetMs,
    },
    inlineCandidateByteBudget: null,
    fileMatcher: () => true,
  });
  const traversalAdmissionDecision = resolveTraversalWorkloadAdmissionDecision({
    requestedRoot: rootPath,
    rootEntry: traversalPreflightContext.rootEntry,
    admissionEvidence: traversalPreflightContext.traversalPreflightAdmissionEvidence,
    candidateWorkloadEvidence,
    executionPolicy,
    consumerCapabilities: {
      toolName: "find_paths_by_name",
      previewFirstSupported: false,
      inlineCandidateFileBudget: executionPolicy.traversalInlineCandidateFileBudget,
      executionTimeCostMultiplier:
        TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS.DISCOVERY.executionTimeCostMultiplier,
      estimatedPerCandidateFileCostMs:
        TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS.DISCOVERY.estimatedPerCandidateFileCostMs,
      taskBackedExecutionSupported: false,
    },
  });

  if (
    traversalAdmissionDecision.outcome
    !== TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.INLINE
  ) {
    throw new Error(
      traversalAdmissionDecision.guidanceText ?? buildTraversalNarrowingGuidance(rootPath),
    );
  }
  const validatedRootPath = traversalPreflightContext.rootEntry.validPath;
  const traversalScopePolicyResolution = traversalPreflightContext.traversalScopePolicyResolution;
  const traversalRuntimeBudgetState = createTraversalRuntimeBudgetState();
  const traversalNarrowingGuidance = buildTraversalNarrowingGuidance(rootPath);

  async function search(currentPath: string) {
    if (truncated) {
      return;
    }

    try {
      recordTraversalDirectoryVisit(traversalRuntimeBudgetState);
      assertTraversalRuntimeBudget(
        "find_paths_by_name",
        traversalRuntimeBudgetState,
        Date.now(),
        traversalNarrowingGuidance,
      );
    } catch (error) {
      if (isTraversalRuntimeBudgetExceededError(error)) {
        if (results.length === 0) {
          throw error;
        }

        truncated = true;
        return;
      }

      throw error;
    }

    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (truncated) {
        break;
      }

      try {
        recordTraversalEntryVisit(traversalRuntimeBudgetState);
        assertTraversalRuntimeBudget(
          "find_paths_by_name",
          traversalRuntimeBudgetState,
          Date.now(),
          traversalNarrowingGuidance,
        );
      } catch (error) {
        if (isTraversalRuntimeBudgetExceededError(error)) {
          if (results.length === 0) {
            throw error;
          }

          truncated = true;
          break;
        }

        throw error;
      }

      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(validatedRootPath, fullPath).split(path.sep).join("/");
      const shouldTraverseExcludedDirectory =
        entry.isDirectory() &&
        shouldTraverseTraversalScopeDirectoryPath(
          relativePath,
          traversalScopePolicyResolution,
        );

      if (
        shouldExcludeTraversalScopePath(relativePath, traversalScopePolicyResolution) &&
        !shouldTraverseExcludedDirectory
      ) {
        continue;
      }

      try {
        // Validate each path before processing
        await validatePath(fullPath, allowedDirectories);

        // Case-insensitive filename matching
        if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
          results.push(fullPath);

          if (results.length >= maxResults) {
            truncated = true;
            break;
          }
        }

        if (entry.isDirectory()) {
          await search(fullPath);
        }
      } catch (error) {
        // Skip invalid paths during search
        continue;
      }
    }
  }

  await search(validatedRootPath);
  return {
    matches: results,
    truncated,
  };
}
