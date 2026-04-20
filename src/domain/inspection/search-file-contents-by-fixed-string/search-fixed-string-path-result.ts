import fs from "fs/promises";
import path from "path";

import {
  buildTraversalNarrowingGuidance,
  resolveTraversalPreflightContext,
  type FilesystemPreflightEntry,
} from "@domain/shared/guardrails/filesystem-preflight";
import {
  TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS,
  resolveTraversalWorkloadAdmissionDecision,
  TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES,
} from "@domain/shared/guardrails/traversal-workload-admission";
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
import {
  resolveTraversalPreviewLanePlan,
  shouldStopTraversalPreviewLane,
} from "@domain/shared/guardrails/traversal-preview-lane";
import { collectTraversalCandidateWorkloadEvidence } from "@domain/shared/guardrails/traversal-candidate-workload";
import {
  resolveSearchExecutionPolicy,
  type SearchExecutionPolicy,
} from "@domain/shared/search/search-execution-policy";
import { REGEX_SEARCH_MAX_RESULTS_HARD_CAP } from "@domain/shared/guardrails/tool-guardrail-limits";
import { detectIoCapabilityProfile } from "@infrastructure/runtime/io-capability-detector";
import { minimatch } from "minimatch";

import {
  type FixedStringSearchMatch,
  type SearchFixedStringPathResult,
} from "./search-fixed-string-result";
import {
  type FixedStringSearchAggregateBudgetState,
  createFixedStringSearchAggregateBudgetState,
} from "./fixed-string-search-aggregate-budget-state";
import { collectFixedStringMatchesFromFileEntry } from "./fixed-string-search-file-entry";
import { getValidatedPreflightEntry } from "./fixed-string-search-support";

const SEARCH_FIXED_STRING_TOOL_NAME = "search_file_contents_by_fixed_string";

function matchesPreviewLaneFilePatterns(
  candidateRelativePath: string,
  filePatterns: string[],
): boolean {
  if (filePatterns.length === 0) {
    return true;
  }

  const normalizedCandidateRelativePath = candidateRelativePath.split(path.sep).join("/");
  const fileName = path.basename(normalizedCandidateRelativePath);

  return filePatterns.some((filePattern) => {
    const normalizedFilePattern = filePattern.split(path.sep).join("/");

    if (normalizedFilePattern.includes("/")) {
      return minimatch(normalizedCandidateRelativePath, normalizedFilePattern, {
        dot: true,
        nocase: true,
      });
    }

    return minimatch(fileName, normalizedFilePattern, { dot: true, nocase: true });
  });
}

/**
 * Resolves the fixed-string search result for one validated file or directory scope.
 *
 * @param searchPath - File or directory search scope in caller-supplied form.
 * @param fixedString - Exact literal string supplied by the caller.
 * @param filePatterns - Include globs that narrow candidate file names before content scanning.
 * @param excludePatterns - Exclude globs that remove candidate paths from traversal.
 * @param includeExcludedGlobs - Additive descendant re-include globs that reopen excluded subtrees.
 * @param respectGitIgnore - Whether optional root-local `.gitignore` enrichment participates in traversal.
 * @param maxResults - Caller-requested maximum number of returned locations per root.
 * @param caseSensitive - Whether literal matching should preserve case sensitivity.
 * @param allowedDirectories - Allowed directory roots enforced by the shared path guard.
 * @param executionPolicy - Shared runtime execution policy for the current request.
 * @param aggregateBudgetState - Request-level aggregate byte accounting surface.
 * @returns Structured per-root fixed-string output that later text and structured surfaces consume.
 */
export async function getSearchFixedStringPathResult(
  searchPath: string,
  fixedString: string,
  filePatterns: string[],
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  maxResults: number,
  caseSensitive: boolean,
  allowedDirectories: string[],
  executionPolicy: SearchExecutionPolicy = resolveSearchExecutionPolicy(
    detectIoCapabilityProfile(),
  ),
  aggregateBudgetState: FixedStringSearchAggregateBudgetState = createFixedStringSearchAggregateBudgetState(),
): Promise<SearchFixedStringPathResult> {
  const traversalPreflightContext = await resolveTraversalPreflightContext(
    SEARCH_FIXED_STRING_TOOL_NAME,
    searchPath,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    allowedDirectories,
  );
  const searchScopeEntry = traversalPreflightContext.rootEntry;
  const effectiveMaxResults = Math.min(maxResults, REGEX_SEARCH_MAX_RESULTS_HARD_CAP);
  const traversalNarrowingGuidance = buildTraversalNarrowingGuidance(searchPath);
  const previewExecutionRuntimeBudgetLimits = {
    maxVisitedEntries: executionPolicy.traversalPreviewExecutionEntryBudget,
    maxVisitedDirectories: executionPolicy.traversalPreviewExecutionDirectoryBudget,
    softTimeBudgetMs: executionPolicy.traversalPreviewExecutionTimeBudgetMs,
  };
  const candidateWorkloadEvidence = searchScopeEntry.type === "directory"
    ? await collectTraversalCandidateWorkloadEvidence({
        validRootPath: searchScopeEntry.validPath,
        traversalScopePolicyResolution: traversalPreflightContext.traversalScopePolicyResolution,
        runtimeBudgetLimits: previewExecutionRuntimeBudgetLimits,
        inlineCandidateByteBudget: executionPolicy.fixedStringSyncCandidateBytesCap,
        fileMatcher: (candidateRelativePath) =>
          matchesPreviewLaneFilePatterns(candidateRelativePath, filePatterns),
      })
    : null;
  const traversalAdmissionDecision = resolveTraversalWorkloadAdmissionDecision({
    requestedRoot: searchPath,
    rootEntry: searchScopeEntry,
    admissionEvidence: traversalPreflightContext.traversalPreflightAdmissionEvidence,
    candidateWorkloadEvidence,
    executionPolicy,
    consumerCapabilities: {
      toolName: SEARCH_FIXED_STRING_TOOL_NAME,
      previewFirstSupported: true,
      inlineCandidateByteBudget: executionPolicy.fixedStringSyncCandidateBytesCap,
      inlineCandidateFileBudget: executionPolicy.traversalInlineCandidateFileBudget,
      executionTimeCostMultiplier:
        TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS.LITERAL_SEARCH.executionTimeCostMultiplier,
      estimatedPerCandidateFileCostMs:
        TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS.LITERAL_SEARCH.estimatedPerCandidateFileCostMs,
      taskBackedExecutionSupported: false,
    },
  });
  const previewFirstAdmissionActive =
    traversalAdmissionDecision.outcome === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST;
  const admissionAdjustedMaxResults = previewFirstAdmissionActive
    ? Math.max(
      1,
      Math.min(
        effectiveMaxResults,
        Math.floor(
          REGEX_SEARCH_MAX_RESULTS_HARD_CAP * executionPolicy.previewFirstResponseCapFraction,
        ),
      ),
    )
    : effectiveMaxResults;
  const previewLanePlan = resolveTraversalPreviewLanePlan(
    searchPath,
    SEARCH_FIXED_STRING_TOOL_NAME,
    traversalAdmissionDecision,
    executionPolicy,
    executionPolicy.fixedStringSyncCandidateBytesCap,
  );

  if (
    traversalAdmissionDecision.outcome
    === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.NARROWING_REQUIRED
    || traversalAdmissionDecision.outcome
    === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.TASK_BACKED_REQUIRED
  ) {
    return {
      root: searchPath,
      matches: [],
      filesSearched: 0,
      totalMatches: 0,
      truncated: false,
      error: traversalAdmissionDecision.guidanceText,
    };
  }

  if (searchScopeEntry.type === "file") {
    if (
      shouldStopTraversalPreviewLane(
        aggregateBudgetState.totalCandidateBytesScanned,
        searchScopeEntry.size,
        previewLanePlan,
      )
    ) {
      return {
        root: searchPath,
        matches: [],
        filesSearched: 0,
        totalMatches: 0,
        truncated: true,
        error: previewLanePlan.guidanceText,
      };
    }

    const fileSearchResult = await collectFixedStringMatchesFromFileEntry(
      searchScopeEntry,
      searchPath,
      fixedString,
      filePatterns,
      caseSensitive,
      executionPolicy,
      aggregateBudgetState,
      true,
      admissionAdjustedMaxResults,
      0,
    );

    return {
      root: searchPath,
      matches: fileSearchResult.matches,
      filesSearched: fileSearchResult.fileSearched ? 1 : 0,
      totalMatches: fileSearchResult.totalMatches,
      truncated: fileSearchResult.truncated || previewFirstAdmissionActive,
      error: null,
    };
  }

  const validRootPath = searchScopeEntry.validPath;
  const traversalScopePolicyResolution =
    traversalPreflightContext.traversalScopePolicyResolution;
  const traversalRuntimeBudgetState = createTraversalRuntimeBudgetState();
  const results: FixedStringSearchMatch[] = [];
  let filesSearched = 0;
  let matchesFound = 0;
  let searchAborted = false;
  let totalBytesScanned = 0;
  let unsupportedStateReason: string | null = null;

  function markTraversalBudgetExceeded(error: unknown): boolean {
    if (!isTraversalRuntimeBudgetExceededError(error)) {
      return false;
    }

    searchAborted = true;

    if (previewLanePlan.guidanceText !== null) {
      unsupportedStateReason = previewLanePlan.guidanceText;
    } else if (unsupportedStateReason === null) {
      unsupportedStateReason = error.message;
    }

    return true;
  }

  async function searchDirectory(dirPath: string, currentRelativePath: string): Promise<void> {
    if (searchAborted) {
      return;
    }

    recordTraversalDirectoryVisit(traversalRuntimeBudgetState);
    try {
      assertTraversalRuntimeBudget(
        SEARCH_FIXED_STRING_TOOL_NAME,
        traversalRuntimeBudgetState,
        Date.now(),
        traversalNarrowingGuidance,
        previewLanePlan.runtimeBudgetLimits ?? undefined,
      );
    } catch (error) {
      if (markTraversalBudgetExceeded(error)) {
        return;
      }

      throw error;
    }

    let entries: import("fs").Dirent<string>[];

    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (searchAborted) {
        break;
      }

      recordTraversalEntryVisit(traversalRuntimeBudgetState);
      try {
        assertTraversalRuntimeBudget(
          SEARCH_FIXED_STRING_TOOL_NAME,
          traversalRuntimeBudgetState,
          Date.now(),
          traversalNarrowingGuidance,
          previewLanePlan.runtimeBudgetLimits ?? undefined,
        );
      } catch (error) {
        if (markTraversalBudgetExceeded(error)) {
          break;
        }

        throw error;
      }

      const rawRelativePath = currentRelativePath === ""
        ? entry.name
        : path.join(currentRelativePath, entry.name);
      const relativePath = rawRelativePath.split(path.sep).join("/");
      const shouldTraverseExcludedDirectory = entry.isDirectory()
        && shouldTraverseTraversalScopeDirectoryPath(
          relativePath,
          traversalScopePolicyResolution,
        );

      if (
        shouldExcludeTraversalScopePath(relativePath, traversalScopePolicyResolution)
        && !shouldTraverseExcludedDirectory
      ) {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);
      let candidateEntry: FilesystemPreflightEntry;

      try {
        candidateEntry = await getValidatedPreflightEntry(fullPath, allowedDirectories);
      } catch {
        continue;
      }

      if (candidateEntry.type === "directory") {
        await searchDirectory(candidateEntry.validPath, rawRelativePath);
        continue;
      }

      if (candidateEntry.type !== "file") {
        continue;
      }

      if (
        shouldStopTraversalPreviewLane(
          aggregateBudgetState.totalCandidateBytesScanned,
          candidateEntry.size,
          previewLanePlan,
        )
      ) {
        searchAborted = true;

        if (unsupportedStateReason === null) {
          unsupportedStateReason = previewLanePlan.guidanceText;
        }

        break;
      }

      const fileSearchResult = await collectFixedStringMatchesFromFileEntry(
        candidateEntry,
        relativePath,
        fixedString,
        filePatterns,
        caseSensitive,
        executionPolicy,
        aggregateBudgetState,
        false,
        admissionAdjustedMaxResults - results.length,
        totalBytesScanned,
      );

      if (fileSearchResult.fileSearched) {
        filesSearched += 1;
      }

      totalBytesScanned = fileSearchResult.totalBytesScanned;
      matchesFound += fileSearchResult.totalMatches;
      results.push(...fileSearchResult.matches);

      if (fileSearchResult.truncated) {
        searchAborted = true;
        break;
      }
    }
  }

  await searchDirectory(validRootPath, "");

  return {
    root: searchPath,
    matches: results,
    filesSearched,
    totalMatches: matchesFound,
    truncated: searchAborted || previewFirstAdmissionActive,
    error: results.length === 0 && unsupportedStateReason !== null ? unsupportedStateReason : null,
  };
}
