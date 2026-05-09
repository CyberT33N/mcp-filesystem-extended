import fs from "fs/promises";
import path from "path";

import {
  assertCandidateByteBudget,
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
  cloneInspectionResumeTraversalFrames,
  commitInspectionResumeTraversalEntry,
} from "@domain/shared/resume/inspection-resume-frontier";
import {
  resolveTraversalPreviewLanePlan,
  shouldStopTraversalPreviewLane,
} from "@domain/shared/guardrails/traversal-preview-lane";
import { collectTraversalCandidateWorkloadEvidence } from "@domain/shared/guardrails/traversal-candidate-workload";
import {
  INSPECTION_CONTENT_OPERATION_LITERALS,
  resolveInspectionContentOperationCapability,
} from "@domain/shared/search/inspection-content-state";
import {
  resolveSearchExecutionPolicy,
  type SearchExecutionPolicy,
} from "@domain/shared/search/search-execution-policy";

import {
  SEARCH_FAMILY_FIXED_STRING_ESTIMATED_PER_CANDIDATE_FILE_COST_MS,
  SEARCH_FAMILY_FIXED_STRING_INLINE_EXECUTION_BUDGET_MS,
} from "../search-family-thresholds";
import {
  createSearchExecutionRuntimeBudgetState,
  createSearchMaxResultsLimitReachedState,
  createSearchPreviewContinuationState,
  createSearchPreviewLaneBudgetState,
  createUnstoppedSearchState,
  SEARCH_STOP_REASON_LITERALS,
  type SearchStopState,
} from "../search-stop-state";
import {
  REGEX_SEARCH_MAX_RESULTS_HARD_CAP,
  REGEX_SEARCH_RESPONSE_CAP_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import { detectIoCapabilityProfile } from "@infrastructure/runtime/io-capability-detector";
import { buildUgrepCommand } from "@infrastructure/search/ugrep-command-builder";
import { formatUgrepSpawnFailure, runUgrepSearch } from "@infrastructure/search/ugrep-runner";
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
import {
  collectFixedStringLineMatches,
  createFixedStringPatternClassification,
  getValidatedPreflightEntry,
  parseUgrepMatchLine,
  resolveTextEligibility,
  sanitizeFixedStringMatchContent,
} from "./fixed-string-search-support";

const SEARCH_FIXED_STRING_TOOL_NAME = "search_file_contents_by_fixed_string";
const SEARCH_FIXED_STRING_INLINE_RESPONSE_OVERHEAD_CHARS = 96;
const SEARCH_FIXED_STRING_INLINE_MATCH_RESPONSE_CHARS = 400;
const SEARCH_FIXED_STRING_NATIVE_INLINE_BATCH_SIZE = 16;

interface SearchFixedStringTraversalFrame {
  directoryRelativePath: string;
  nextEntryIndex: number;
}

export interface SearchFixedStringRootContinuationState {
  traversalFrames: SearchFixedStringTraversalFrame[];
  activeFileRelativePath: string | null;
  activeFileMatchOffset: number;
}

interface FixedStringNativeBatchEntry {
  candidateEntry: FilesystemPreflightEntry;
}

interface FixedStringNativeBatchSearchResult {
  matches: FixedStringSearchMatch[];
  totalMatches: number;
  truncated: boolean;
  stopState: SearchStopState;
}

function cloneSearchFixedStringTraversalFrames(
  traversalFrames: SearchFixedStringTraversalFrame[],
): SearchFixedStringTraversalFrame[] {
  return cloneInspectionResumeTraversalFrames(traversalFrames);
}

function createInitialSearchFixedStringTraversalFrames(): SearchFixedStringTraversalFrame[] {
  return [{ directoryRelativePath: "", nextEntryIndex: 0 }];
}

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

interface GetSearchFixedStringPathResultOptions {
  searchPath: string;
  fixedString: string;
  filePatterns: string[];
  excludePatterns: string[];
  includeExcludedGlobs: string[];
  respectGitIgnore: boolean;
  maxResults: number;
  caseSensitive: boolean;
  allowedDirectories: string[];
  executionPolicy?: SearchExecutionPolicy;
  aggregateBudgetState?: FixedStringSearchAggregateBudgetState;
  batchRootCount?: number;
  continuationState?: SearchFixedStringRootContinuationState | null;
  requestedResumeMode?: import("@domain/shared/resume/inspection-resume-contract").InspectionResumeMode | null;
}

async function collectFixedStringMatchesFromNativeBatch(
  batchEntries: FixedStringNativeBatchEntry[],
  fixedString: string,
  caseSensitive: boolean,
  executionPolicy: SearchExecutionPolicy,
  maxAdditionalResults: number,
): Promise<FixedStringNativeBatchSearchResult> {
  if (batchEntries.length === 0 || maxAdditionalResults <= 0) {
    return {
      matches: [],
      totalMatches: 0,
      truncated: maxAdditionalResults <= 0,
      stopState: maxAdditionalResults <= 0
        ? createSearchMaxResultsLimitReachedState(maxAdditionalResults)
        : createUnstoppedSearchState(),
    };
  }

  const command = buildUgrepCommand({
    patternClassification: createFixedStringPatternClassification(fixedString),
    executionPolicy,
    candidatePaths: batchEntries.map(({ candidateEntry }) => candidateEntry.validPath),
    caseSensitive,
    maxCount: maxAdditionalResults,
  });
  const executionResult = await runUgrepSearch(command);

  if (executionResult.spawnErrorMessage !== null) {
    throw new Error(formatUgrepSpawnFailure(executionResult));
  }

  if (executionResult.timedOut) {
    throw new Error("Native search runner timed out before completion.");
  }

  if (executionResult.exitCode !== null && executionResult.exitCode > 1) {
    const runtimeError = executionResult.stderr.trim();

    throw new Error(
      runtimeError === ""
        ? `Native search backend exited with code ${executionResult.exitCode}.`
        : runtimeError,
    );
  }

  if (executionResult.exitCode === 1 || executionResult.stdout.trim() === "") {
    return {
      matches: [],
      totalMatches: 0,
      truncated: false,
      stopState: createUnstoppedSearchState(),
    };
  }

  const matches: FixedStringSearchMatch[] = [];
  let totalMatches = 0;
  let truncated = false;
  const matchedLines = executionResult.stdout
    .split(/\r?\n/u)
    .filter((outputLine) => outputLine.trim() !== "");

  for (const matchedLine of matchedLines) {
    const parsedLine = parseUgrepMatchLine(matchedLine);

    if (parsedLine === null) {
      continue;
    }

    for (const matchedText of collectFixedStringLineMatches(
      parsedLine.lineContent,
      fixedString,
      caseSensitive,
    )) {
      totalMatches += 1;
      matches.push({
        file: parsedLine.file,
        line: parsedLine.line,
        content: sanitizeFixedStringMatchContent(
          parsedLine.lineContent,
          matchedText,
          false,
        ),
        match: matchedText,
      });

      if (matches.length >= maxAdditionalResults) {
        truncated = true;
        break;
      }
    }

    if (truncated) {
      break;
    }
  }

  return {
    matches,
    totalMatches,
    truncated,
    stopState: truncated
      ? createSearchMaxResultsLimitReachedState(maxAdditionalResults)
      : createUnstoppedSearchState(),
  };
}

/**
 * Resolves the fixed-string search result for one validated file or directory scope.
 *
 * @param options - Request, traversal, resume, and runtime options for one fixed-string search scope.
 * @returns Structured per-root fixed-string output that later text and structured surfaces consume.
 */
export async function getSearchFixedStringPathResult(
  options: GetSearchFixedStringPathResultOptions,
): Promise<SearchFixedStringPathResult & {
  admissionOutcome: typeof TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES[keyof typeof TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES];
  nextContinuationState: SearchFixedStringRootContinuationState | null;
}> {
  const {
    searchPath,
    fixedString,
    filePatterns,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    maxResults,
    caseSensitive,
    allowedDirectories,
    executionPolicy = resolveSearchExecutionPolicy(
      detectIoCapabilityProfile(),
    ),
    aggregateBudgetState = createFixedStringSearchAggregateBudgetState(),
    batchRootCount = 1,
    continuationState = null,
    requestedResumeMode = null,
  } = options;

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
  const projectedInlineTextChars =
    SEARCH_FIXED_STRING_INLINE_RESPONSE_OVERHEAD_CHARS
    + effectiveMaxResults * SEARCH_FIXED_STRING_INLINE_MATCH_RESPONSE_CHARS;
  const inlineTextResponseCapChars = Math.max(
    1,
    Math.floor(REGEX_SEARCH_RESPONSE_CAP_CHARS / Math.max(1, batchRootCount)),
  );
  const traversalAdmissionDecision = resolveTraversalWorkloadAdmissionDecision({
    requestedRoot: searchPath,
    rootEntry: searchScopeEntry,
    admissionEvidence: traversalPreflightContext.traversalPreflightAdmissionEvidence,
    candidateWorkloadEvidence,
    projectedInlineTextChars,
    executionPolicy,
    consumerCapabilities: {
      toolName: SEARCH_FIXED_STRING_TOOL_NAME,
      previewFirstSupported: true,
      inlineCandidateByteBudget: executionPolicy.fixedStringSyncCandidateBytesCap,
      inlineCandidateFileBudget: executionPolicy.traversalInlineCandidateFileBudget,
      inlineTextResponseCapChars,
      executionTimeCostMultiplier:
        TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS.LITERAL_SEARCH.executionTimeCostMultiplier,
      estimatedPerCandidateFileCostMs:
        SEARCH_FAMILY_FIXED_STRING_ESTIMATED_PER_CANDIDATE_FILE_COST_MS,
      inlineExecutionBudgetMs: SEARCH_FAMILY_FIXED_STRING_INLINE_EXECUTION_BUDGET_MS,
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
  const completeResultRequested =
    traversalAdmissionDecision.outcome === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST
    && requestedResumeMode === "complete-result";
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
    === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED
  ) {
    return {
      root: searchPath,
      matches: [],
      filesSearched: 0,
      totalMatches: 0,
      truncated: false,
      error: traversalAdmissionDecision.guidanceText,
      stopReason: null,
      stopMessage: null,
      admissionOutcome: traversalAdmissionDecision.outcome,
      nextContinuationState: null,
    };
  }

  if (searchScopeEntry.type === "file") {
    const activeFileMatchOffset = continuationState?.activeFileRelativePath === ""
      ? continuationState.activeFileMatchOffset
      : 0;
    const explicitFileScopePatterns: string[] = [];

    const fileSearchResult = await collectFixedStringMatchesFromFileEntry(
      searchScopeEntry,
      searchPath,
      fixedString,
      explicitFileScopePatterns,
      caseSensitive,
      executionPolicy,
      aggregateBudgetState,
      false,
      true,
      admissionAdjustedMaxResults,
      activeFileMatchOffset,
      0,
    );

    const nextContinuationState = previewFirstAdmissionActive && fileSearchResult.truncated
      ? {
          traversalFrames: [],
          activeFileRelativePath: "",
          activeFileMatchOffset: activeFileMatchOffset + fileSearchResult.matches.length,
        }
      : null;

    const fileScopeStopState = nextContinuationState !== null
      ? createSearchPreviewContinuationState()
      : fileSearchResult.stopState;

    return {
      root: searchPath,
      matches: fileSearchResult.matches,
      filesSearched: fileSearchResult.fileSearched ? 1 : 0,
      totalMatches: fileSearchResult.totalMatches,
      truncated: fileSearchResult.truncated || nextContinuationState !== null,
      error: null,
      stopReason: fileScopeStopState.stopReason,
      stopMessage: fileScopeStopState.stopMessage,
      admissionOutcome: traversalAdmissionDecision.outcome,
      nextContinuationState,
    };
  }

  const validRootPath = searchScopeEntry.validPath;
  const traversalScopePolicyResolution =
    traversalPreflightContext.traversalScopePolicyResolution;
  const traversalRuntimeBudgetState = createTraversalRuntimeBudgetState();
  const traversalFrames = continuationState === null
    ? createInitialSearchFixedStringTraversalFrames()
    : cloneSearchFixedStringTraversalFrames(continuationState.traversalFrames);
  const results: FixedStringSearchMatch[] = [];
  let filesSearched = 0;
  let matchesFound = 0;
  let searchAborted = false;
  let totalBytesScanned = 0;
  let unsupportedStateReason: string | null = null;
  let searchStopState = createUnstoppedSearchState();
  let activeFileRelativePath = continuationState?.activeFileRelativePath ?? null;
  let activeFileMatchOffset = continuationState?.activeFileMatchOffset ?? 0;
  const pendingNativeBatch: FixedStringNativeBatchEntry[] = [];

  function markTraversalBudgetExceeded(error: unknown): boolean {
    if (!isTraversalRuntimeBudgetExceededError(error)) {
      return false;
    }

    searchAborted = true;

    unsupportedStateReason = error.message;
    searchStopState = createSearchExecutionRuntimeBudgetState(error.message);

    return true;
  }

  async function flushPendingNativeBatch(): Promise<void> {
    if (pendingNativeBatch.length === 0 || searchAborted) {
      return;
    }

    const batchEntries = pendingNativeBatch.splice(0, pendingNativeBatch.length);
    const batchSearchResult = await collectFixedStringMatchesFromNativeBatch(
      batchEntries,
      fixedString,
      caseSensitive,
      executionPolicy,
      admissionAdjustedMaxResults - results.length,
    );

    filesSearched += batchEntries.length;
    matchesFound += batchSearchResult.totalMatches;
    results.push(...batchSearchResult.matches);

    if (batchSearchResult.truncated) {
      searchAborted = true;
      searchStopState = batchSearchResult.stopState;
    }
  }

  if (activeFileRelativePath !== null) {
    const activeFileAbsolutePath = activeFileRelativePath === ""
      ? validRootPath
      : path.join(validRootPath, activeFileRelativePath);
    const activeFileCandidateEntry = await getValidatedPreflightEntry(activeFileAbsolutePath, allowedDirectories);
    const resumedFilePatterns = activeFileRelativePath === "" ? [] : filePatterns;

    const resumedFileSearchResult = await collectFixedStringMatchesFromFileEntry(
      activeFileCandidateEntry,
      activeFileRelativePath === "" ? searchPath : activeFileRelativePath,
      fixedString,
      resumedFilePatterns,
      caseSensitive,
      executionPolicy,
      aggregateBudgetState,
      activeFileRelativePath !== "",
      false,
      admissionAdjustedMaxResults,
      activeFileMatchOffset,
      totalBytesScanned,
    );

    if (resumedFileSearchResult.fileSearched) {
      filesSearched += 1;
    }

    totalBytesScanned = resumedFileSearchResult.totalBytesScanned;
    matchesFound += resumedFileSearchResult.totalMatches;
    results.push(...resumedFileSearchResult.matches);

    if (resumedFileSearchResult.truncated) {
      searchAborted = true;
      searchStopState = resumedFileSearchResult.stopState;
      activeFileMatchOffset += resumedFileSearchResult.matches.length;
    } else {
      activeFileRelativePath = null;
      activeFileMatchOffset = 0;
    }
  }

  while (traversalFrames.length > 0 && !searchAborted) {
    const currentTraversalFrame = traversalFrames[traversalFrames.length - 1];

    if (currentTraversalFrame === undefined) {
      break;
    }

    const currentPath = currentTraversalFrame.directoryRelativePath === ""
      ? validRootPath
      : path.join(validRootPath, currentTraversalFrame.directoryRelativePath);

    if (currentTraversalFrame.nextEntryIndex === 0) {
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
          break;
        }

        throw error;
      }
    }

    let entries: import("fs").Dirent<string>[];

    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      traversalFrames.pop();
      continue;
    }

    let descendedIntoChildDirectory = false;

    while (currentTraversalFrame.nextEntryIndex < entries.length && !searchAborted) {
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

      const entry = entries[currentTraversalFrame.nextEntryIndex];

      if (entry === undefined) {
        break;
      }

      const rawRelativePath = currentTraversalFrame.directoryRelativePath === ""
        ? entry.name
        : path.join(currentTraversalFrame.directoryRelativePath, entry.name);
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
        commitInspectionResumeTraversalEntry(currentTraversalFrame);
        continue;
      }

      const fullPath = path.join(currentPath, entry.name);
      let candidateEntry: FilesystemPreflightEntry;

      try {
        candidateEntry = await getValidatedPreflightEntry(fullPath, allowedDirectories);
      } catch {
        commitInspectionResumeTraversalEntry(currentTraversalFrame);
        continue;
      }

      if (candidateEntry.type === "directory") {
        commitInspectionResumeTraversalEntry(currentTraversalFrame);
        traversalFrames.push({
          directoryRelativePath: rawRelativePath,
          nextEntryIndex: 0,
        });
        descendedIntoChildDirectory = true;
        break;
      }

      if (candidateEntry.type !== "file") {
        commitInspectionResumeTraversalEntry(currentTraversalFrame);
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

        searchStopState = createSearchPreviewLaneBudgetState(
          previewLanePlan.guidanceText
            ?? `Preview-lane candidate byte budget was exhausted for root '${searchPath}'.`,
        );

        break;
      }

      if (!previewFirstAdmissionActive) {
        if (!matchesPreviewLaneFilePatterns(relativePath, filePatterns)) {
          commitInspectionResumeTraversalEntry(currentTraversalFrame);
          continue;
        }

        const nextTotalBytesScanned = totalBytesScanned + candidateEntry.size;
        const nextAggregateBytesScanned = aggregateBudgetState.totalCandidateBytesScanned + candidateEntry.size;

        assertCandidateByteBudget(
          SEARCH_FIXED_STRING_TOOL_NAME,
          nextAggregateBytesScanned,
          executionPolicy.fixedStringServiceHardGapBytes,
          `fixed-string aggregate candidate bytes before reading ${candidateEntry.requestedPath}`,
        );

        aggregateBudgetState.totalCandidateBytesScanned = nextAggregateBytesScanned;
        totalBytesScanned = nextTotalBytesScanned;

        const textEligibility = await resolveTextEligibility(candidateEntry.validPath, candidateEntry.size);
        const searchCapability = resolveInspectionContentOperationCapability(
          textEligibility,
          INSPECTION_CONTENT_OPERATION_LITERALS.SEARCH_TEXT,
        );

        if (!searchCapability.isAllowed) {
          if (unsupportedStateReason === null) {
            unsupportedStateReason = searchCapability.reason;
          }

          commitInspectionResumeTraversalEntry(currentTraversalFrame);
          continue;
        }

        if (searchCapability.requiresDecodedTextFallback) {
          await flushPendingNativeBatch();

          const fileSearchResult = await collectFixedStringMatchesFromFileEntry(
            candidateEntry,
            relativePath,
            fixedString,
            filePatterns,
            caseSensitive,
            executionPolicy,
            aggregateBudgetState,
            false,
            false,
            admissionAdjustedMaxResults - results.length,
            0,
            totalBytesScanned - candidateEntry.size,
          );

          if (fileSearchResult.fileSearched) {
            filesSearched += 1;
          }

          totalBytesScanned = fileSearchResult.totalBytesScanned;
          matchesFound += fileSearchResult.totalMatches;
          results.push(...fileSearchResult.matches);

          if (fileSearchResult.truncated) {
            searchAborted = true;
            searchStopState = fileSearchResult.stopState;
            commitInspectionResumeTraversalEntry(currentTraversalFrame);
            break;
          }

          commitInspectionResumeTraversalEntry(currentTraversalFrame);
          continue;
        }

        pendingNativeBatch.push({
          candidateEntry,
        });
        commitInspectionResumeTraversalEntry(currentTraversalFrame);

        if (pendingNativeBatch.length >= SEARCH_FIXED_STRING_NATIVE_INLINE_BATCH_SIZE) {
          await flushPendingNativeBatch();

          if (searchAborted) {
            break;
          }
        }

        continue;
      }

      const fileSearchResult = await collectFixedStringMatchesFromFileEntry(
        candidateEntry,
        relativePath,
        fixedString,
        filePatterns,
        caseSensitive,
        executionPolicy,
        aggregateBudgetState,
        true,
        false,
        admissionAdjustedMaxResults - results.length,
        0,
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
        searchStopState = fileSearchResult.stopState;
        activeFileRelativePath = relativePath;
        activeFileMatchOffset = fileSearchResult.matches.length;
        commitInspectionResumeTraversalEntry(currentTraversalFrame);
        break;
      }

      commitInspectionResumeTraversalEntry(currentTraversalFrame);
    }

    if (!descendedIntoChildDirectory && currentTraversalFrame.nextEntryIndex >= entries.length) {
      traversalFrames.pop();
    }
  }

  if (!previewFirstAdmissionActive && !searchAborted) {
    await flushPendingNativeBatch();
  }

  const nextContinuationState = previewFirstAdmissionActive
    && !completeResultRequested
    && (traversalFrames.length > 0 || activeFileRelativePath !== null)
      ? {
          traversalFrames: cloneSearchFixedStringTraversalFrames(traversalFrames),
          activeFileRelativePath,
          activeFileMatchOffset,
        }
      : null;

  const rootStopState = nextContinuationState !== null
    && (
      searchStopState.stopReason === null
      || searchStopState.stopReason === SEARCH_STOP_REASON_LITERALS.MAX_RESULTS_LIMIT_REACHED
    )
    ? createSearchPreviewContinuationState()
    : searchStopState;

  return {
    root: searchPath,
    matches: results,
    filesSearched,
    totalMatches: matchesFound,
    truncated: searchAborted || nextContinuationState !== null,
    error:
      results.length === 0
      && unsupportedStateReason !== null
      && rootStopState.stopReason === null
        ? unsupportedStateReason
        : null,
    stopReason: rootStopState.stopReason,
    stopMessage: rootStopState.stopMessage,
    admissionOutcome: traversalAdmissionDecision.outcome,
    nextContinuationState,
  };
}
