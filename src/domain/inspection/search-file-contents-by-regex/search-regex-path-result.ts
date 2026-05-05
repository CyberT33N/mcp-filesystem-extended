import fs from "fs/promises";
import path from "path";

import {
  assertCandidateByteBudget,
  buildTraversalNarrowingGuidance,
  collectValidatedFilesystemPreflightEntries,
  resolveTraversalPreflightContext,
  type FilesystemPreflightEntry,
} from "@domain/shared/guardrails/filesystem-preflight";
import {
  TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS,
  resolveTraversalWorkloadAdmissionDecision,
  TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES,
} from "@domain/shared/guardrails/traversal-workload-admission";
import {
  cloneInspectionResumeTraversalFrames,
  commitInspectionResumeTraversalEntry,
} from "@domain/shared/resume/inspection-resume-frontier";
import {
  assertRegexRuntimeBudget,
  createRegexBackendDialectRejectedError,
  createGuardrailedSearchRegexExecutionPlan,
  normalizeRegexMatchExcerpt,
  resetRegexLastIndex,
  type GuardrailedSearchRegexExecutionPlan,
} from "@domain/shared/guardrails/regex-search-safety";
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
import type { PatternClassification } from "@domain/shared/search/pattern-classifier";
import { resolveSearchExecutionPolicy, type SearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";
import {
  INSPECTION_CONTENT_OPERATION_LITERALS,
  resolveInspectionContentOperationCapability,
} from "@domain/shared/search/inspection-content-state";
import {
  classifyTextBinarySurface,
  type TextBinaryClassification,
} from "@domain/shared/search/text-binary-classifier";
import {
  readDecodedInspectionTextFile,
  readSharedInspectionContentSample,
} from "@infrastructure/filesystem/text-read-core";
import {
  REGEX_SEARCH_MAX_RESULTS_HARD_CAP,
  REGEX_SEARCH_RESPONSE_CAP_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import { buildUgrepCommand } from "@infrastructure/search/ugrep-command-builder";
import { formatUgrepSpawnFailure, runUgrepSearch } from "@infrastructure/search/ugrep-runner";
import { detectIoCapabilityProfile } from "@infrastructure/runtime/io-capability-detector";
import { minimatch } from "minimatch";

import { type RegexSearchMatch, type SearchRegexPathResult } from "./search-regex-result";

const SEARCH_REGEX_INLINE_RESPONSE_OVERHEAD_CHARS = 96;
const SEARCH_REGEX_INLINE_MATCH_RESPONSE_CHARS = 400;

/**
 * Mutable aggregate budget state shared across all requested regex roots.
 *
 * @remarks
 * The regex endpoint keeps one request-level candidate-byte accounting surface so later roots do
 * not silently reset large-workload accounting back to zero.
 */
export interface RegexSearchAggregateBudgetState {
  /**
   * Aggregate candidate bytes scanned across the current request.
   */
  totalCandidateBytesScanned: number;
}

interface SearchRegexTraversalFrame {
  directoryRelativePath: string;
  nextEntryIndex: number;
}

export interface SearchRegexRootContinuationState {
  traversalFrames: SearchRegexTraversalFrame[];
  activeFileRelativePath: string | null;
  activeFileMatchOffset: number;
}

/**
 * Creates the canonical request-aggregate budget state for one regex request.
 *
 * @returns Fresh aggregate accounting state with zero scanned candidate bytes.
 */
export function createRegexSearchAggregateBudgetState(): RegexSearchAggregateBudgetState {
  return {
    totalCandidateBytesScanned: 0,
  };
}

function cloneSearchRegexTraversalFrames(
  traversalFrames: SearchRegexTraversalFrame[],
): SearchRegexTraversalFrame[] {
  return cloneInspectionResumeTraversalFrames(traversalFrames);
}

function createInitialSearchRegexTraversalFrames(): SearchRegexTraversalFrame[] {
  return [{ directoryRelativePath: "", nextEntryIndex: 0 }];
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function matchesIncludedFilePatterns(candidateRelativePath: string, filePatterns: string[]): boolean {
  if (filePatterns.length === 0) {
    return true;
  }

  const normalizedCandidateRelativePath = normalizeRelativePath(candidateRelativePath);
  const fileName = path.basename(normalizedCandidateRelativePath);

  return filePatterns.some((filePattern) => {
    const normalizedFilePattern = normalizeRelativePath(filePattern);

    if (normalizedFilePattern.includes("/")) {
      return minimatch(normalizedCandidateRelativePath, normalizedFilePattern, {
        dot: true,
        nocase: true,
      });
    }

    return minimatch(fileName, normalizedFilePattern, { dot: true, nocase: true });
  });
}

function getLineMatchContext(
  lines: string[],
  matchPosition: number,
): {
  lineNumber: number;
  lineContent: string;
} {
  let charCount = 0;

  for (let index = 0; index < lines.length; index++) {
    const currentLine = lines[index] ?? "";

    charCount += currentLine.length + 1;

    if (charCount > matchPosition) {
      return {
        lineNumber: index + 1,
        lineContent: currentLine,
      };
    }
  }

  const lastLineIndex = Math.max(0, lines.length - 1);

  return {
    lineNumber: lastLineIndex + 1,
    lineContent: lines[lastLineIndex] ?? "",
  };
}

async function resolveTextEligibility(
  candidatePath: string,
  candidateFileBytes: number,
): Promise<TextBinaryClassification> {
  const sharedInspectionSample = await readSharedInspectionContentSample(
    candidatePath,
    candidateFileBytes,
  );

  return classifyTextBinarySurface({
    candidatePath,
    candidateFileBytes,
    contentSample: sharedInspectionSample.contentSample,
    sampledWindowPositions: sharedInspectionSample.sampledWindowPositions,
  });
}

function collectRegexMatchesFromDecodedText(
  candidateEntry: FilesystemPreflightEntry,
  regex: RegExp,
  content: string,
  maxAdditionalResults: number,
  matchesToSkipBeforeCollecting: number,
): {
  matches: RegexSearchMatch[];
  totalMatches: number;
  truncated: boolean;
} {
  const matches: RegexSearchMatch[] = [];
  let totalMatches = 0;
  let truncated = false;
  let remainingMatchesToSkip = matchesToSkipBeforeCollecting;
  const lines = content.split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const lineContent = lines[index] ?? "";
    let lineMatch: RegExpExecArray | null;

    resetRegexLastIndex(regex);

    while ((lineMatch = regex.exec(lineContent)) !== null) {
      if (remainingMatchesToSkip > 0) {
        remainingMatchesToSkip -= 1;
        continue;
      }

      totalMatches += 1;
      matches.push({
        content: normalizeRegexMatchExcerpt(lineContent, lineMatch[0]),
        file: candidateEntry.requestedPath,
        line: index + 1,
        match: lineMatch[0],
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
  };
}

function parseUgrepMatchLine(outputLine: string): {
  file: string;
  line: number;
  lineContent: string;
} | null {
  const parsedLine = /^(.*):(\d+):(.*)$/.exec(outputLine);

  if (parsedLine === null) {
    return null;
  }

  const file = parsedLine[1] ?? "";
  const lineNumberText = parsedLine[2] ?? "0";
  const lineContent = parsedLine[3] ?? "";
  const line = Number.parseInt(lineNumberText, 10);

  if (!Number.isInteger(line) || line <= 0) {
    return null;
  }

  return {
    file,
    line,
    lineContent,
  };
}

function isNativeRegexBackendPatternSyntaxFailure(runtimeError: string): boolean {
  const normalizedRuntimeError = runtimeError.toLowerCase();

  return normalizedRuntimeError.includes("invalid syntax")
    || normalizedRuntimeError.includes("invalid regular expression")
    || normalizedRuntimeError.includes("look-ahead")
    || normalizedRuntimeError.includes("look-behind")
    || (
      normalizedRuntimeError.includes("regex")
      && normalizedRuntimeError.includes("syntax")
    );
}

interface GetSearchRegexPathResultOptions {
  toolName: string;
  searchPath: string;
  pattern: string;
  filePatterns: string[];
  excludePatterns: string[];
  includeExcludedGlobs: string[];
  respectGitIgnore: boolean;
  maxResults: number;
  caseSensitive: boolean;
  allowedDirectories: string[];
  executionPolicy?: SearchExecutionPolicy;
  aggregateBudgetState?: RegexSearchAggregateBudgetState;
  batchRootCount?: number;
  continuationState?: SearchRegexRootContinuationState | null;
  requestedResumeMode?: import("@domain/shared/resume/inspection-resume-contract").InspectionResumeMode | null;
  regexExecutionPlan?: GuardrailedSearchRegexExecutionPlan;
}

async function getValidatedPreflightEntry(
  toolName: string,
  requestedPath: string,
  allowedDirectories: string[],
): Promise<FilesystemPreflightEntry> {
  const entries = await collectValidatedFilesystemPreflightEntries(
    toolName,
    [requestedPath],
    allowedDirectories,
  );
  const firstEntry = entries[0];

  if (firstEntry === undefined) {
    throw new Error(`Expected one validated preflight entry for path: ${requestedPath}`);
  }

  return firstEntry;
}

async function collectRegexMatchesFromFileEntry(
  toolName: string,
  candidateEntry: FilesystemPreflightEntry,
  candidateRelativePath: string,
  filePatterns: string[],
  regex: RegExp,
  patternClassification: PatternClassification,
  pattern: string,
  caseSensitive: boolean,
  executionPolicy: SearchExecutionPolicy,
  aggregateBudgetState: RegexSearchAggregateBudgetState,
  enforceAggregateCandidateByteBudget: boolean,
  refuseUnsupportedFileScope: boolean,
  maxAdditionalResults: number,
  matchesToSkipBeforeCollecting: number,
  totalBytesScannedBeforeRead: number,
  collectedLocationsBeforeRead: number,
): Promise<{
  matches: RegexSearchMatch[];
  fileSearched: boolean;
  totalMatches: number;
  totalBytesScanned: number;
  truncated: boolean;
  unsupportedStateReason: string | null;
}> {
  if (!matchesIncludedFilePatterns(candidateRelativePath, filePatterns)) {
    return {
      matches: [],
      fileSearched: false,
      totalMatches: 0,
      totalBytesScanned: totalBytesScannedBeforeRead,
      truncated: false,
      unsupportedStateReason: null,
    };
  }

  const nextTotalBytesScanned = totalBytesScannedBeforeRead + candidateEntry.size;

  const nextAggregateBytesScanned = aggregateBudgetState.totalCandidateBytesScanned + candidateEntry.size;
  const runtimeBudgetCandidateBytes = enforceAggregateCandidateByteBudget
    ? nextAggregateBytesScanned
    : 0;

  if (enforceAggregateCandidateByteBudget) {
    assertCandidateByteBudget(
      toolName,
      nextAggregateBytesScanned,
      executionPolicy.regexServiceHardGapBytes,
      `regex aggregate candidate bytes before reading ${candidateEntry.requestedPath}`,
    );

    aggregateBudgetState.totalCandidateBytesScanned = nextAggregateBytesScanned;
  }

  const textEligibility = await resolveTextEligibility(
    candidateEntry.validPath,
    candidateEntry.size,
  );
  const searchCapability = resolveInspectionContentOperationCapability(
    textEligibility,
    INSPECTION_CONTENT_OPERATION_LITERALS.SEARCH_TEXT,
  );

  if (!searchCapability.isAllowed) {
    if (refuseUnsupportedFileScope) {
      throw new Error(searchCapability.reason);
    }

    return {
      matches: [],
        fileSearched: false,
        totalMatches: 0,
        totalBytesScanned: nextTotalBytesScanned,
        truncated: false,
        unsupportedStateReason: searchCapability.reason,
      };
  }

  if (maxAdditionalResults <= 0) {
    return {
      matches: [],
      fileSearched: true,
      totalMatches: 0,
      totalBytesScanned: nextTotalBytesScanned,
      truncated: true,
      unsupportedStateReason: null,
    };
  }

  const previewFirstTriggered = nextAggregateBytesScanned > executionPolicy.regexSyncCandidateBytesCap;
  const effectiveLocationCap = previewFirstTriggered
    ? Math.max(
        1,
        Math.min(
          maxAdditionalResults,
          Math.floor(
            REGEX_SEARCH_MAX_RESULTS_HARD_CAP * executionPolicy.previewFirstResponseCapFraction,
          ),
        ),
      )
    : maxAdditionalResults;

  if (searchCapability.requiresDecodedTextFallback) {
    const decodedTextFile = await readDecodedInspectionTextFile(
      candidateEntry.validPath,
      textEligibility.resolvedTextEncoding,
    );
    const decodedTextSearchResult = collectRegexMatchesFromDecodedText(
      candidateEntry,
      regex,
      decodedTextFile.content,
      effectiveLocationCap,
      matchesToSkipBeforeCollecting,
    );

    assertRegexRuntimeBudget(
      toolName,
      collectedLocationsBeforeRead + decodedTextSearchResult.matches.length,
      runtimeBudgetCandidateBytes,
    );

    return {
      matches: decodedTextSearchResult.matches,
      fileSearched: true,
      totalMatches: decodedTextSearchResult.totalMatches,
      totalBytesScanned: nextTotalBytesScanned,
      truncated: decodedTextSearchResult.truncated,
      unsupportedStateReason: null,
    };
  }

  const command = buildUgrepCommand({
    patternClassification,
    executionPolicy,
    candidatePath: candidateEntry.validPath,
    caseSensitive,
    maxCount: effectiveLocationCap,
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

    if (runtimeError !== "" && isNativeRegexBackendPatternSyntaxFailure(runtimeError)) {
      throw createRegexBackendDialectRejectedError(
        toolName,
        pattern,
        caseSensitive,
        runtimeError,
      );
    }

    throw new Error(
      runtimeError === ""
        ? `Native search backend exited with code ${executionResult.exitCode}.`
        : runtimeError,
    );
  }

  if (executionResult.exitCode === 1 || executionResult.stdout.trim() === "") {
    return {
      matches: [],
      fileSearched: true,
      totalMatches: 0,
      totalBytesScanned: nextTotalBytesScanned,
      truncated: false,
      unsupportedStateReason: null,
    };
  }

  const matches: RegexSearchMatch[] = [];
  let totalMatches = 0;
  let truncated = false;
  let remainingMatchesToSkip = matchesToSkipBeforeCollecting;

  const matchedLines = executionResult.stdout
    .split(/\r?\n/u)
    .filter((outputLine) => outputLine.trim() !== "");

  for (const matchedLine of matchedLines) {
    const parsedLine = parseUgrepMatchLine(matchedLine);

    if (parsedLine === null) {
      continue;
    }

    let lineMatch: RegExpExecArray | null;

    resetRegexLastIndex(regex);

    while ((lineMatch = regex.exec(parsedLine.lineContent)) !== null) {
      if (remainingMatchesToSkip > 0) {
        remainingMatchesToSkip -= 1;
        continue;
      }

      totalMatches += 1;

      matches.push({
        file: parsedLine.file,
        line: parsedLine.line,
        content: normalizeRegexMatchExcerpt(parsedLine.lineContent, lineMatch[0]),
        match: lineMatch[0],
      });

      assertRegexRuntimeBudget(
        toolName,
        collectedLocationsBeforeRead + matches.length,
        runtimeBudgetCandidateBytes,
      );

      if (matches.length >= effectiveLocationCap) {
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
    fileSearched: true,
    totalMatches,
    totalBytesScanned: nextTotalBytesScanned,
    truncated,
    unsupportedStateReason: null,
  };
}

/**
 * Resolves the regex-search result for one validated file or directory scope.
 *
 * @remarks
 * This endpoint-specific resolver preserves the current regex root contract while combining shared
 * filesystem preflight, structural regex safety, candidate-byte budgets, and guarded traversal.
 * The module stays inside the regex endpoint boundary because mixed file-versus-directory scope
 * normalization is part of the public regex contract rather than a generic shared-search concern.
 *
 * @param options - Request, traversal, resume, and runtime options for one regex-search scope.
 * @returns Structured per-root regex output that later text and structured response surfaces consume.
 */
export async function getSearchRegexPathResult(
  options: GetSearchRegexPathResultOptions,
): Promise<SearchRegexPathResult & {
  admissionOutcome: typeof TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES[keyof typeof TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES];
  nextContinuationState: SearchRegexRootContinuationState | null;
}> {
  const {
    toolName,
    searchPath,
    pattern,
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
    aggregateBudgetState = createRegexSearchAggregateBudgetState(),
    batchRootCount = 1,
    continuationState = null,
    requestedResumeMode = null,
  } = options;

  const traversalPreflightContext = await resolveTraversalPreflightContext(
    toolName,
    searchPath,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    allowedDirectories,
  );
  const searchScopeEntry = traversalPreflightContext.rootEntry;
  const regexExecutionPlan = options.regexExecutionPlan
    ?? createGuardrailedSearchRegexExecutionPlan(toolName, pattern, caseSensitive);
  const regex = regexExecutionPlan.regex;
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
        inlineCandidateByteBudget: executionPolicy.regexSyncCandidateBytesCap,
        fileMatcher: (candidateRelativePath) =>
          matchesIncludedFilePatterns(candidateRelativePath, filePatterns),
      })
    : null;
  const projectedInlineTextChars =
    SEARCH_REGEX_INLINE_RESPONSE_OVERHEAD_CHARS
    + effectiveMaxResults * SEARCH_REGEX_INLINE_MATCH_RESPONSE_CHARS;
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
      toolName,
      previewFirstSupported: true,
      inlineCandidateByteBudget: executionPolicy.regexSyncCandidateBytesCap,
      inlineCandidateFileBudget: executionPolicy.traversalInlineCandidateFileBudget,
      inlineTextResponseCapChars,
      executionTimeCostMultiplier:
        TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS.REGEX_SEARCH.executionTimeCostMultiplier,
      estimatedPerCandidateFileCostMs:
        TRAVERSAL_ADMISSION_EXECUTION_COST_MODELS.REGEX_SEARCH.estimatedPerCandidateFileCostMs,
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
    toolName,
    traversalAdmissionDecision,
    executionPolicy,
    executionPolicy.regexSyncCandidateBytesCap,
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
      admissionOutcome: traversalAdmissionDecision.outcome,
      nextContinuationState: null,
    };
  }

  if (searchScopeEntry.type === "file") {
    const activeFileMatchOffset = continuationState?.activeFileRelativePath === ""
      ? continuationState.activeFileMatchOffset
      : 0;
    const explicitFileScopePatterns: string[] = [];

    const fileSearchResult = await collectRegexMatchesFromFileEntry(
      toolName,
      searchScopeEntry,
      searchPath,
      explicitFileScopePatterns,
      regex,
      regexExecutionPlan.patternClassification,
      pattern,
      caseSensitive,
      executionPolicy,
      aggregateBudgetState,
      false,
      true,
      admissionAdjustedMaxResults,
      activeFileMatchOffset,
      0,
      0,
    );

    const nextContinuationState = previewFirstAdmissionActive && fileSearchResult.truncated
      ? {
          traversalFrames: [],
          activeFileRelativePath: "",
          activeFileMatchOffset: activeFileMatchOffset + fileSearchResult.matches.length,
        }
      : null;

    return {
      root: searchPath,
      matches: fileSearchResult.matches,
      filesSearched: fileSearchResult.fileSearched ? 1 : 0,
      totalMatches: fileSearchResult.totalMatches,
      truncated: fileSearchResult.truncated || nextContinuationState !== null,
      error: null,
      admissionOutcome: traversalAdmissionDecision.outcome,
      nextContinuationState,
    };
  }

  const validRootPath = searchScopeEntry.validPath;
  const traversalScopePolicyResolution =
    traversalPreflightContext.traversalScopePolicyResolution;
  const traversalRuntimeBudgetState = createTraversalRuntimeBudgetState();
  const traversalFrames = continuationState === null
    ? createInitialSearchRegexTraversalFrames()
    : cloneSearchRegexTraversalFrames(continuationState.traversalFrames);

  const results: RegexSearchMatch[] = [];
  let filesSearched = 0;
  let matchesFound = 0;
  let searchAborted = false;
  let totalBytesScanned = 0;
  let unsupportedStateReason: string | null = null;
  let activeFileRelativePath = continuationState?.activeFileRelativePath ?? null;
  let activeFileMatchOffset = continuationState?.activeFileMatchOffset ?? 0;

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

  if (activeFileRelativePath !== null) {
    const activeFileAbsolutePath = activeFileRelativePath === ""
      ? validRootPath
      : path.join(validRootPath, activeFileRelativePath);
    const activeFileCandidateEntry = await getValidatedPreflightEntry(
      toolName,
      activeFileAbsolutePath,
      allowedDirectories,
    );
    const resumedFilePatterns = activeFileRelativePath === "" ? [] : filePatterns;

    const resumedFileSearchResult = await collectRegexMatchesFromFileEntry(
      toolName,
      activeFileCandidateEntry,
      activeFileRelativePath === "" ? searchPath : activeFileRelativePath,
      resumedFilePatterns,
      regex,
      regexExecutionPlan.patternClassification,
      pattern,
      caseSensitive,
      executionPolicy,
      aggregateBudgetState,
      activeFileRelativePath !== "",
      false,
      admissionAdjustedMaxResults,
      activeFileMatchOffset,
      totalBytesScanned,
      results.length,
    );

    if (resumedFileSearchResult.fileSearched) {
      filesSearched += 1;
    }

    totalBytesScanned = resumedFileSearchResult.totalBytesScanned;
    matchesFound += resumedFileSearchResult.totalMatches;
    results.push(...resumedFileSearchResult.matches);

    if (
      unsupportedStateReason === null
      && resumedFileSearchResult.unsupportedStateReason !== null
    ) {
      unsupportedStateReason = resumedFileSearchResult.unsupportedStateReason;
    }

    if (resumedFileSearchResult.truncated) {
      searchAborted = true;
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
          toolName,
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
          toolName,
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
      const relativePath = normalizeRelativePath(rawRelativePath);
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
        candidateEntry = await getValidatedPreflightEntry(toolName, fullPath, allowedDirectories);
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

        break;
      }

      const fileSearchResult = await collectRegexMatchesFromFileEntry(
        toolName,
        candidateEntry,
        relativePath,
        filePatterns,
        regex,
        regexExecutionPlan.patternClassification,
        pattern,
        caseSensitive,
        executionPolicy,
        aggregateBudgetState,
        true,
        false,
        admissionAdjustedMaxResults - results.length,
        0,
        totalBytesScanned,
        results.length,
      );

      if (fileSearchResult.fileSearched) {
        filesSearched += 1;
      }

      totalBytesScanned = fileSearchResult.totalBytesScanned;
      matchesFound += fileSearchResult.totalMatches;
      results.push(...fileSearchResult.matches);

      if (
        unsupportedStateReason === null
        && fileSearchResult.unsupportedStateReason !== null
      ) {
        unsupportedStateReason = fileSearchResult.unsupportedStateReason;
      }

      if (fileSearchResult.truncated) {
        searchAborted = true;
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

  const nextContinuationState = previewFirstAdmissionActive
    && !completeResultRequested
    && (traversalFrames.length > 0 || activeFileRelativePath !== null)
    ? {
        traversalFrames: cloneSearchRegexTraversalFrames(traversalFrames),
        activeFileRelativePath,
        activeFileMatchOffset,
      }
    : null;

  return {
    root: searchPath,
    matches: results,
    filesSearched,
    totalMatches: matchesFound,
    truncated: searchAborted || nextContinuationState !== null,
    error: results.length === 0 && unsupportedStateReason !== null ? unsupportedStateReason : null,
    admissionOutcome: traversalAdmissionDecision.outcome,
    nextContinuationState,
  };
}
