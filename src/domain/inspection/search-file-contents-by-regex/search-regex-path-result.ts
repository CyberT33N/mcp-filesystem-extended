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
  resolveTraversalWorkloadAdmissionDecision,
  TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES,
} from "@domain/shared/guardrails/traversal-workload-admission";
import {
  assertRegexRuntimeBudget,
  compileGuardrailedSearchRegex,
  normalizeRegexMatchExcerpt,
  resetRegexLastIndex,
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
import { classifyPattern } from "@domain/shared/search/pattern-classifier";
import { resolveSearchExecutionPolicy, type SearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";
import {
  classifyInspectionContentState,
  INSPECTION_CONTENT_STATE_LITERALS,
  type InspectionContentStateClassification,
} from "@domain/shared/search/inspection-content-state";
import { REGEX_SEARCH_MAX_RESULTS_HARD_CAP } from "@domain/shared/guardrails/tool-guardrail-limits";
import { buildUgrepCommand } from "@infrastructure/search/ugrep-command-builder";
import { runUgrepSearch } from "@infrastructure/search/ugrep-runner";
import { detectIoCapabilityProfile } from "@infrastructure/runtime/io-capability-detector";
import { minimatch } from "minimatch";

import { type RegexSearchMatch, type SearchRegexPathResult } from "./search-regex-result";

const TEXT_BINARY_PROBE_SAMPLE_BYTES = 4_096;

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

async function readTextBinaryProbeSample(candidatePath: string): Promise<Uint8Array | null> {
  let fileHandle;

  try {
    fileHandle = await fs.open(candidatePath, "r");
  } catch {
    return null;
  }

  try {
    const probeBuffer = Buffer.alloc(TEXT_BINARY_PROBE_SAMPLE_BYTES);
    const { bytesRead } = await fileHandle.read(probeBuffer, 0, probeBuffer.length, 0);

    return probeBuffer.subarray(0, bytesRead);
  } finally {
    await fileHandle.close();
  }
}

async function resolveTextEligibility(
  candidatePath: string,
  ): Promise<InspectionContentStateClassification & { isTextEligible: boolean }> {
  const toTextEligibilityResult = (
    classification: InspectionContentStateClassification,
  ): InspectionContentStateClassification & { isTextEligible: boolean } => ({
    ...classification,
    isTextEligible:
      classification.resolvedState === INSPECTION_CONTENT_STATE_LITERALS.TEXT_CONFIDENT,
  });

  const initialClassification = toTextEligibilityResult(
    classifyInspectionContentState({ candidatePath }),
  );

  if (initialClassification.isTextEligible) {
    return initialClassification;
  }

  const contentSample = await readTextBinaryProbeSample(candidatePath);

  if (contentSample === null) {
    return initialClassification;
  }

  return toTextEligibilityResult(
    classifyInspectionContentState({
      candidatePath,
      contentSample,
    }),
  );
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
  pattern: string,
  caseSensitive: boolean,
  executionPolicy: SearchExecutionPolicy,
  aggregateBudgetState: RegexSearchAggregateBudgetState,
  refuseUnsupportedFileScope: boolean,
  maxAdditionalResults: number,
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

  assertCandidateByteBudget(
    toolName,
    nextAggregateBytesScanned,
    executionPolicy.regexServiceHardGapBytes,
    `regex aggregate candidate bytes before reading ${candidateEntry.requestedPath}`,
  );

  aggregateBudgetState.totalCandidateBytesScanned = nextAggregateBytesScanned;

  const textEligibility = await resolveTextEligibility(candidateEntry.validPath);

  if (!textEligibility.isTextEligible) {
    if (refuseUnsupportedFileScope) {
      throw new Error(textEligibility.classificationReason);
    }

    return {
      matches: [],
      fileSearched: false,
      totalMatches: 0,
      totalBytesScanned: nextTotalBytesScanned,
      truncated: false,
      unsupportedStateReason: textEligibility.classificationReason,
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

  const command = buildUgrepCommand({
    patternClassification: classifyPattern(pattern),
    executionPolicy,
    candidatePath: candidateEntry.validPath,
    caseSensitive,
    maxCount: effectiveLocationCap,
  });

  const executionResult = await runUgrepSearch(command);

  if (executionResult.spawnErrorMessage !== null) {
    throw new Error(`Native search runner failed to start: ${executionResult.spawnErrorMessage}`);
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
        nextAggregateBytesScanned,
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
 * @param toolName - Exact MCP tool name that owns the current regex execution.
 * @param searchPath - File or directory search scope in caller-supplied form.
 * @param pattern - Raw regex pattern supplied by the caller.
 * @param filePatterns - Include globs that narrow candidate file names before content scanning.
 * @param excludePatterns - Exclude globs that remove candidate paths from traversal.
 * @param includeExcludedGlobs - Additive descendant re-include globs that reopen excluded subtrees.
 * @param respectGitIgnore - Whether optional root-local `.gitignore` enrichment participates in traversal.
 * @param maxResults - Caller-requested maximum number of returned locations per root.
 * @param caseSensitive - Whether regex compilation should preserve case sensitivity.
 * @param allowedDirectories - Allowed directory roots enforced by the shared path guard.
 * @returns Structured per-root regex output that later text and structured response surfaces consume.
 */
export async function getSearchRegexPathResult(
  toolName: string,
  searchPath: string,
  pattern: string,
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
  aggregateBudgetState: RegexSearchAggregateBudgetState = createRegexSearchAggregateBudgetState(),
): Promise<SearchRegexPathResult> {
  const traversalPreflightContext = await resolveTraversalPreflightContext(
    toolName,
    searchPath,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    allowedDirectories,
  );
  const searchScopeEntry = traversalPreflightContext.rootEntry;
  const regex = compileGuardrailedSearchRegex(toolName, pattern, caseSensitive);
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
  const traversalAdmissionDecision = resolveTraversalWorkloadAdmissionDecision({
    requestedRoot: searchPath,
    rootEntry: searchScopeEntry,
    admissionEvidence: traversalPreflightContext.traversalPreflightAdmissionEvidence,
    candidateWorkloadEvidence,
    executionPolicy,
    consumerCapabilities: {
      toolName,
      previewFirstSupported: true,
      inlineCandidateByteBudget: executionPolicy.regexSyncCandidateBytesCap,
      inlineCandidateFileBudget: executionPolicy.traversalInlineCandidateFileBudget,
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
    toolName,
    traversalAdmissionDecision,
    executionPolicy,
    executionPolicy.regexSyncCandidateBytesCap,
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

    const fileSearchResult = await collectRegexMatchesFromFileEntry(
      toolName,
      searchScopeEntry,
      searchPath,
      filePatterns,
      regex,
      pattern,
      caseSensitive,
      executionPolicy,
      aggregateBudgetState,
      true,
      admissionAdjustedMaxResults,
      0,
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

  const results: RegexSearchMatch[] = [];
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

  async function searchDirectory(
    dirPath: string,
    currentRelativePath: string,
  ): Promise<void> {
    if (searchAborted) {
      return;
    }

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

      const rawRelativePath = currentRelativePath === ""
        ? entry.name
        : path.join(currentRelativePath, entry.name);
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
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);
      let candidateEntry: FilesystemPreflightEntry;

      try {
        candidateEntry = await getValidatedPreflightEntry(toolName, fullPath, allowedDirectories);
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

      const fileSearchResult = await collectRegexMatchesFromFileEntry(
        toolName,
        candidateEntry,
        relativePath,
        filePatterns,
        regex,
        pattern,
        caseSensitive,
        executionPolicy,
        aggregateBudgetState,
        false,
        admissionAdjustedMaxResults - results.length,
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
