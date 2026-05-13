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
  COMPLETE_RESULT_TRAVERSAL_RUNTIME_BUDGET_LIMITS,
  createTraversalRuntimeBudgetState,
  isTraversalRuntimeBudgetExceededError,
  recordTraversalDirectoryVisit,
  recordTraversalEntryVisit,
} from "@domain/shared/guardrails/traversal-runtime-budget";
import { INSPECTION_RESUME_MODES } from "@domain/shared/resume/inspection-resume-contract";
import { resolveTraversalScopeEntryPolicy } from "@domain/shared/guardrails/traversal-scope-policy";
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
  type InspectionContentTextEncoding,
  resolveInspectionContentOperationCapability,
} from "@domain/shared/search/inspection-content-state";
import {
  resolveSearchExecutionPolicy,
  type SearchExecutionPolicy,
} from "@domain/shared/search/search-execution-policy";

import {
  SEARCH_FAMILY_FIXED_STRING_ESTIMATED_PER_CANDIDATE_FILE_COST_MS,
  SEARCH_FAMILY_FIXED_STRING_INLINE_EXECUTION_BUDGET_MS,
  SEARCH_FAMILY_PREVIEW_EXECUTION_SOFT_TIME_BUDGET_MS,
} from "../search-family-thresholds";
import {
  createSearchCompletionContinuationState,
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
import { readDecodedInspectionTextFile } from "@infrastructure/filesystem/text-read-core";
import { buildUgrepCommand } from "@infrastructure/search/ugrep-command-builder";
import { withTemporaryUgrepCandidatePathListFile } from "@infrastructure/search/ugrep-candidate-path-list-file";
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
import {
  collectFixedStringMatchesFromDecodedText,
  collectFixedStringMatchesFromFileEntry,
} from "./fixed-string-search-file-entry";
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
  materializedExecutionPlan?: FixedStringMaterializedExecutionPlanState | null;
}

interface FixedStringBatchCandidateEntry {
  requestedPath: string;
  size: number;
  validPath: string;
}

interface FixedStringNativeBatchEntry {
  candidateEntry: FixedStringBatchCandidateEntry;
  candidateRelativePath: string;
  entryIndexAfter?: number;
  nextUnitIndexAfter?: number;
}

interface FixedStringMaterializedNativeExecutionUnit {
  candidateAbsolutePath: string;
  candidateRelativePath: string;
  kind: "native";
  size: number;
}

interface FixedStringMaterializedDecodedFallbackExecutionUnit {
  candidateAbsolutePath: string;
  candidateRelativePath: string;
  kind: "decoded-fallback";
  resolvedTextEncoding: InspectionContentTextEncoding;
  size: number;
}

type FixedStringMaterializedExecutionUnit =
  | FixedStringMaterializedNativeExecutionUnit
  | FixedStringMaterializedDecodedFallbackExecutionUnit;

interface FixedStringMaterializedExecutionPlanState {
  nextUnitIndex: number;
  units: FixedStringMaterializedExecutionUnit[];
}

interface FixedStringNativeBatchSearchResult {
  matches: FixedStringSearchMatch[];
  totalMatches: number;
  truncated: boolean;
  stopState: SearchStopState;
  activeBatchEntryIndex: number | null;
  activeBatchEntryMatchOffset: number;
}

function cloneSearchFixedStringTraversalFrames(
  traversalFrames: SearchFixedStringTraversalFrame[],
): SearchFixedStringTraversalFrame[] {
  return cloneInspectionResumeTraversalFrames(traversalFrames);
}

function createInitialSearchFixedStringTraversalFrames(): SearchFixedStringTraversalFrame[] {
  return [{ directoryRelativePath: "", nextEntryIndex: 0 }];
}

function normalizeBatchCandidatePath(candidatePath: string): string {
  return candidatePath.replaceAll("\\", "/").toLowerCase();
}

function sumFixedStringNativeBatchBytes(batchEntries: FixedStringNativeBatchEntry[]): number {
  return batchEntries.reduce(
    (totalBytes, batchEntry) => totalBytes + batchEntry.candidateEntry.size,
    0,
  );
}

function createFixedStringBatchCandidateEntry(
  candidateAbsolutePath: string,
  size: number,
): FixedStringBatchCandidateEntry {
  return {
    requestedPath: candidateAbsolutePath,
    size,
    validPath: candidateAbsolutePath,
  };
}

function createFixedStringDecodedFallbackBatchCandidateEntry(
  executionUnit: FixedStringMaterializedDecodedFallbackExecutionUnit,
): FilesystemPreflightEntry {
  return {
    requestedPath: executionUnit.candidateAbsolutePath,
    size: executionUnit.size,
    type: "file",
    validPath: executionUnit.candidateAbsolutePath,
  };
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

function createFixedStringTraversalPreflightWorkloadPolicy(
  filePatterns: string[],
) {
  return {
    shouldCountFileEntryTowardBudget: (
      candidateRelativePath: string,
      entry: import("fs").Dirent<string>,
    ): boolean => !entry.isFile() || matchesPreviewLaneFilePatterns(candidateRelativePath, filePatterns),
  };
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
      activeBatchEntryIndex: null,
      activeBatchEntryMatchOffset: 0,
      stopState: maxAdditionalResults <= 0
        ? createSearchMaxResultsLimitReachedState(maxAdditionalResults)
        : createUnstoppedSearchState(),
    };
  }

  const candidatePaths = batchEntries.map(({ candidateEntry }) => candidateEntry.validPath);
  const useManifestBackedCandidateList =
    batchEntries.some((batchEntry) => batchEntry.nextUnitIndexAfter !== undefined)
    || batchEntries.length > SEARCH_FIXED_STRING_NATIVE_INLINE_BATCH_SIZE;
  const executionResult = useManifestBackedCandidateList
    ? await withTemporaryUgrepCandidatePathListFile(
        candidatePaths,
        async (candidatePathListFile) =>
          runUgrepSearch(
            buildUgrepCommand({
              patternClassification: createFixedStringPatternClassification(fixedString),
              executionPolicy,
              candidatePathListFile,
              caseSensitive,
              maxCount: maxAdditionalResults,
            }),
          ),
      )
    : await runUgrepSearch(
        buildUgrepCommand({
          patternClassification: createFixedStringPatternClassification(fixedString),
          executionPolicy,
          candidatePaths,
          caseSensitive,
          maxCount: maxAdditionalResults,
        }),
      );

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
      activeBatchEntryIndex: null,
      activeBatchEntryMatchOffset: 0,
      stopState: createUnstoppedSearchState(),
    };
  }

  const matches: FixedStringSearchMatch[] = [];
  let totalMatches = 0;
  let truncated = false;
  let activeBatchEntryIndex: number | null = null;
  let activeBatchEntryMatchOffset = 0;
  const batchEntryIndexByPath = new Map<string, number>(
    batchEntries.map((batchEntry, index) => [
      normalizeBatchCandidatePath(batchEntry.candidateEntry.validPath),
      index,
    ]),
  );
  const emittedMatchCountsByBatchEntryIndex = new Map<number, number>();
  const matchedLines = executionResult.stdout
    .split(/\r?\n/u)
    .filter((outputLine) => outputLine.trim() !== "");

  for (const matchedLine of matchedLines) {
    const parsedLine = parseUgrepMatchLine(matchedLine);

    if (parsedLine === null) {
      continue;
    }

    const parsedBatchEntryIndex = batchEntryIndexByPath.get(
      normalizeBatchCandidatePath(parsedLine.file),
    );

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

      if (parsedBatchEntryIndex !== undefined) {
        const nextEmittedMatchCount =
          (emittedMatchCountsByBatchEntryIndex.get(parsedBatchEntryIndex) ?? 0) + 1;
        emittedMatchCountsByBatchEntryIndex.set(
          parsedBatchEntryIndex,
          nextEmittedMatchCount,
        );
        activeBatchEntryIndex = parsedBatchEntryIndex;
        activeBatchEntryMatchOffset = nextEmittedMatchCount;
      }

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
    activeBatchEntryIndex,
    activeBatchEntryMatchOffset,
    stopState: truncated
      ? createSearchMaxResultsLimitReachedState(maxAdditionalResults)
      : createUnstoppedSearchState(),
  };
}

interface FixedStringExecutionPlanMaterializationResult {
  executionPlan: FixedStringMaterializedExecutionPlanState | null;
  stopState: SearchStopState;
  totalBytesScanned: number;
  unsupportedStateReason: string | null;
}

async function collectFixedStringMatchesFromDecodedFallbackExecutionUnit(options: {
  caseSensitive: boolean;
  executionUnit: FixedStringMaterializedDecodedFallbackExecutionUnit;
  fixedString: string;
  maxAdditionalResults: number;
}): Promise<{
  matches: FixedStringSearchMatch[];
  fileSearched: boolean;
  totalMatches: number;
  truncated: boolean;
  stopState: SearchStopState;
}> {
  const {
    caseSensitive,
    executionUnit,
    fixedString,
    maxAdditionalResults,
  } = options;

  if (maxAdditionalResults <= 0) {
    return {
      matches: [],
      fileSearched: true,
      totalMatches: 0,
      truncated: true,
      stopState: createSearchMaxResultsLimitReachedState(maxAdditionalResults),
    };
  }

  const decodedTextFile = await readDecodedInspectionTextFile(
    executionUnit.candidateAbsolutePath,
    executionUnit.resolvedTextEncoding,
  );
  const decodedTextSearchResult = collectFixedStringMatchesFromDecodedText(
    createFixedStringDecodedFallbackBatchCandidateEntry(executionUnit),
    fixedString,
    caseSensitive,
    decodedTextFile.content,
    maxAdditionalResults,
    0,
  );

  return {
    matches: decodedTextSearchResult.matches,
    fileSearched: true,
    totalMatches: decodedTextSearchResult.totalMatches,
    truncated: decodedTextSearchResult.truncated,
    stopState: decodedTextSearchResult.truncated
      ? createSearchMaxResultsLimitReachedState(maxAdditionalResults)
      : createUnstoppedSearchState(),
  };
}

async function materializeFixedStringExecutionPlanFromTraversal(options: {
  aggregateBudgetState: FixedStringSearchAggregateBudgetState;
  allowedDirectories: string[];
  effectiveTraversalRuntimeBudgetLimits:
    | import("@domain/shared/guardrails/traversal-runtime-budget").TraversalRuntimeBudgetLimits
    | undefined;
  executionPolicy: SearchExecutionPolicy;
  filePatterns: string[];
  totalBytesScanned: number;
  traversalFrames: SearchFixedStringTraversalFrame[];
  traversalNarrowingGuidance: string;
  traversalRuntimeBudgetState: import("@domain/shared/guardrails/traversal-runtime-budget").TraversalRuntimeBudgetState;
  traversalScopePolicyResolution: import("@domain/shared/guardrails/traversal-scope-policy").TraversalScopePolicyResolution;
  validRootPath: string;
}): Promise<FixedStringExecutionPlanMaterializationResult> {
  const {
    aggregateBudgetState,
    allowedDirectories,
    effectiveTraversalRuntimeBudgetLimits,
    executionPolicy,
    filePatterns,
    fixedString,
    traversalFrames,
    traversalNarrowingGuidance,
    traversalRuntimeBudgetState,
    traversalScopePolicyResolution,
    validRootPath,
  } = options;
  const executionUnits: FixedStringMaterializedExecutionUnit[] = [];
  let totalBytesScanned = options.totalBytesScanned;
  let unsupportedStateReason: string | null = null;
  let materializationStopState = createUnstoppedSearchState();
  let materializationStopped = false;

  while (traversalFrames.length > 0 && !materializationStopped) {
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
          effectiveTraversalRuntimeBudgetLimits,
        );
      } catch (error) {
        if (isTraversalRuntimeBudgetExceededError(error)) {
          materializationStopState = createSearchExecutionRuntimeBudgetState(error.message);
          materializationStopped = true;
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

    while (currentTraversalFrame.nextEntryIndex < entries.length && !materializationStopped) {
      recordTraversalEntryVisit(traversalRuntimeBudgetState);

      try {
        assertTraversalRuntimeBudget(
          SEARCH_FIXED_STRING_TOOL_NAME,
          traversalRuntimeBudgetState,
          Date.now(),
          traversalNarrowingGuidance,
          effectiveTraversalRuntimeBudgetLimits,
        );
      } catch (error) {
        if (isTraversalRuntimeBudgetExceededError(error)) {
          materializationStopState = createSearchExecutionRuntimeBudgetState(error.message);
          materializationStopped = true;
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
      const entryPolicy = await resolveTraversalScopeEntryPolicy(
        relativePath,
        entry.isDirectory(),
        traversalScopePolicyResolution,
      );

      if (entryPolicy.excluded) {
        commitInspectionResumeTraversalEntry(currentTraversalFrame);
        continue;
      }

      if (entry.isFile() && !matchesPreviewLaneFilePatterns(relativePath, filePatterns)) {
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

        if (entryPolicy.shouldTraverse) {
          traversalFrames.push({
            directoryRelativePath: rawRelativePath,
            nextEntryIndex: 0,
          });
          descendedIntoChildDirectory = true;
          break;
        }

        continue;
      }

      if (candidateEntry.type !== "file") {
        commitInspectionResumeTraversalEntry(currentTraversalFrame);
        continue;
      }

      const nextTotalBytesScanned = totalBytesScanned + candidateEntry.size;
      const nextAggregateBytesScanned =
        aggregateBudgetState.totalCandidateBytesScanned + candidateEntry.size;

      assertCandidateByteBudget(
        SEARCH_FIXED_STRING_TOOL_NAME,
        nextAggregateBytesScanned,
        executionPolicy.fixedStringServiceHardGapBytes,
        `fixed-string aggregate candidate bytes before reading ${candidateEntry.requestedPath}`,
      );

      aggregateBudgetState.totalCandidateBytesScanned = nextAggregateBytesScanned;
      totalBytesScanned = nextTotalBytesScanned;

      const textEligibility = await resolveTextEligibility(
        candidateEntry.validPath,
        candidateEntry.size,
      );
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
        executionUnits.push({
          candidateAbsolutePath: candidateEntry.validPath,
          candidateRelativePath: relativePath,
          kind: "decoded-fallback",
          resolvedTextEncoding: textEligibility.resolvedTextEncoding,
          size: candidateEntry.size,
        });
        commitInspectionResumeTraversalEntry(currentTraversalFrame);
        continue;
      }

      executionUnits.push({
        candidateAbsolutePath: candidateEntry.validPath,
        candidateRelativePath: relativePath,
        kind: "native",
        size: candidateEntry.size,
      });
      commitInspectionResumeTraversalEntry(currentTraversalFrame);
    }

    if (!descendedIntoChildDirectory && currentTraversalFrame.nextEntryIndex >= entries.length) {
      traversalFrames.pop();
    }
  }

  return {
    executionPlan: executionUnits.length === 0
      ? null
      : {
          nextUnitIndex: 0,
          units: executionUnits,
        },
    stopState: materializationStopState,
    totalBytesScanned,
    unsupportedStateReason,
  };
}

interface FixedStringExecutionPlanExecutionResult {
  activeFileMatchOffset: number;
  activeFileRelativePath: string | null;
  executionPlan: FixedStringMaterializedExecutionPlanState | null;
  filesSearched: number;
  matches: FixedStringSearchMatch[];
  searchAborted: boolean;
  stopState: SearchStopState;
  totalMatches: number;
}

async function executeMaterializedFixedStringExecutionPlan(options: {
  caseSensitive: boolean;
  executionPlan: FixedStringMaterializedExecutionPlanState;
  executionPolicy: SearchExecutionPolicy;
  fixedString: string;
  rootResultLimit: number;
  resultsAlreadyCollected: number;
}): Promise<FixedStringExecutionPlanExecutionResult> {
  const {
    caseSensitive,
    executionPlan,
    executionPolicy,
    fixedString,
    rootResultLimit,
    resultsAlreadyCollected,
  } = options;
  let activeFileRelativePath: string | null = null;
  let activeFileMatchOffset = 0;
  let filesSearched = 0;
  const matches: FixedStringSearchMatch[] = [];
  let searchAborted = false;
  let searchStopState = createUnstoppedSearchState();
  let totalMatches = 0;
  let nextUnitIndex = executionPlan.nextUnitIndex;

  while (nextUnitIndex < executionPlan.units.length && !searchAborted) {
    const remainingLocationBudget =
      rootResultLimit - (resultsAlreadyCollected + matches.length);

    if (remainingLocationBudget <= 0) {
      searchAborted = true;
      searchStopState = createSearchMaxResultsLimitReachedState(remainingLocationBudget);
      break;
    }

    const currentExecutionUnit = executionPlan.units[nextUnitIndex];

    if (currentExecutionUnit === undefined) {
      break;
    }

    if (currentExecutionUnit.kind === "decoded-fallback") {
      const decodedFallbackSearchResult =
        await collectFixedStringMatchesFromDecodedFallbackExecutionUnit({
          caseSensitive,
          executionUnit: currentExecutionUnit,
          fixedString,
          maxAdditionalResults: remainingLocationBudget,
        });

      filesSearched += decodedFallbackSearchResult.fileSearched ? 1 : 0;
      totalMatches += decodedFallbackSearchResult.totalMatches;
      matches.push(...decodedFallbackSearchResult.matches);
      nextUnitIndex += 1;

      if (decodedFallbackSearchResult.truncated) {
        activeFileRelativePath = currentExecutionUnit.candidateRelativePath;
        activeFileMatchOffset = decodedFallbackSearchResult.matches.length;
        searchAborted = true;
        searchStopState = decodedFallbackSearchResult.stopState;
      }

      continue;
    }

    const batchEntries: FixedStringNativeBatchEntry[] = [];
    let scanUnitIndex = nextUnitIndex;

    while (scanUnitIndex < executionPlan.units.length) {
      const batchUnit = executionPlan.units[scanUnitIndex];

      if (batchUnit === undefined || batchUnit.kind !== "native") {
        break;
      }

      batchEntries.push({
        candidateEntry: createFixedStringBatchCandidateEntry(
          batchUnit.candidateAbsolutePath,
          batchUnit.size,
        ),
        candidateRelativePath: batchUnit.candidateRelativePath,
        nextUnitIndexAfter: scanUnitIndex + 1,
      });
      scanUnitIndex += 1;
    }

    const batchSearchResult = await collectFixedStringMatchesFromNativeBatch(
      batchEntries,
      fixedString,
      caseSensitive,
      executionPolicy,
      remainingLocationBudget,
    );
    const processedBatchEntryCount = batchSearchResult.truncated
      ? Math.max(0, (batchSearchResult.activeBatchEntryIndex ?? -1) + 1)
      : batchEntries.length;

    filesSearched += processedBatchEntryCount;
    totalMatches += batchSearchResult.totalMatches;
    matches.push(...batchSearchResult.matches);

    if (batchSearchResult.truncated) {
      const activeBatchEntry = batchSearchResult.activeBatchEntryIndex === null
        ? undefined
        : batchEntries[batchSearchResult.activeBatchEntryIndex];

      if (activeBatchEntry !== undefined) {
        activeFileRelativePath = activeBatchEntry.candidateRelativePath;
        activeFileMatchOffset = batchSearchResult.activeBatchEntryMatchOffset;
        nextUnitIndex = activeBatchEntry.nextUnitIndexAfter ?? scanUnitIndex;
      } else {
        nextUnitIndex = scanUnitIndex;
      }

      searchAborted = true;
      searchStopState = batchSearchResult.stopState;
      continue;
    }

    nextUnitIndex = scanUnitIndex;
  }

  return {
    activeFileMatchOffset,
    activeFileRelativePath,
    executionPlan: nextUnitIndex < executionPlan.units.length
      ? {
          ...executionPlan,
          nextUnitIndex,
        }
      : null,
    filesSearched,
    matches,
    searchAborted,
    stopState: searchStopState,
    totalMatches,
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
    ["file", "directory"],
    true,
    createFixedStringTraversalPreflightWorkloadPolicy(filePatterns),
  );
  const searchScopeEntry = traversalPreflightContext.rootEntry;
  const effectiveMaxResults = Math.min(maxResults, REGEX_SEARCH_MAX_RESULTS_HARD_CAP);
  const traversalNarrowingGuidance = buildTraversalNarrowingGuidance(searchPath);
  const previewExecutionRuntimeBudgetLimits = {
    maxVisitedEntries: executionPolicy.traversalPreviewExecutionEntryBudget,
    maxVisitedDirectories: executionPolicy.traversalPreviewExecutionDirectoryBudget,
    softTimeBudgetMs: SEARCH_FAMILY_PREVIEW_EXECUTION_SOFT_TIME_BUDGET_MS,
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
  const completeResultRequested =
    traversalAdmissionDecision.outcome === TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST
    && requestedResumeMode === INSPECTION_RESUME_MODES.COMPLETE_RESULT;
  const admissionAdjustedMaxResults = previewFirstAdmissionActive && !completeResultRequested
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
  const previewLanePlan = completeResultRequested
    ? {
        candidateByteBudget: null,
        guidanceText: null,
        runtimeBudgetLimits: null,
      }
    : (() => {
        const resolvedPreviewLanePlan = resolveTraversalPreviewLanePlan(
          searchPath,
          SEARCH_FIXED_STRING_TOOL_NAME,
          traversalAdmissionDecision,
          executionPolicy,
          executionPolicy.fixedStringSyncCandidateBytesCap,
        );

        if (resolvedPreviewLanePlan.runtimeBudgetLimits === null) {
          return resolvedPreviewLanePlan;
        }

        return {
          ...resolvedPreviewLanePlan,
          runtimeBudgetLimits: {
            ...resolvedPreviewLanePlan.runtimeBudgetLimits,
            softTimeBudgetMs: SEARCH_FAMILY_PREVIEW_EXECUTION_SOFT_TIME_BUDGET_MS,
          },
        };
      })();
  const effectiveTraversalRuntimeBudgetLimits = completeResultRequested
    ? COMPLETE_RESULT_TRAVERSAL_RUNTIME_BUDGET_LIMITS
    : previewLanePlan.runtimeBudgetLimits ?? undefined;
  const useBatchedNativeExecutionPath = !previewFirstAdmissionActive || completeResultRequested;

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
  let materializedExecutionPlan = continuationState?.materializedExecutionPlan ?? null;
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

  async function flushPendingNativeBatch(
    currentTraversalFrame?: SearchFixedStringTraversalFrame,
  ): Promise<void> {
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

    const processedBatchEntryCount = batchSearchResult.truncated
      ? Math.max(0, (batchSearchResult.activeBatchEntryIndex ?? -1) + 1)
      : batchEntries.length;

    filesSearched += processedBatchEntryCount;
    matchesFound += batchSearchResult.totalMatches;
    results.push(...batchSearchResult.matches);

    if (batchSearchResult.truncated) {
      if (
        completeResultRequested
        && currentTraversalFrame !== undefined
        && batchSearchResult.activeBatchEntryIndex !== null
      ) {
        const activeBatchEntry = batchEntries[batchSearchResult.activeBatchEntryIndex];

        if (activeBatchEntry !== undefined) {
          const unprocessedBatchEntries = batchEntries.slice(processedBatchEntryCount);
          const unprocessedBatchBytes = sumFixedStringNativeBatchBytes(unprocessedBatchEntries);

          totalBytesScanned -= unprocessedBatchBytes;
          aggregateBudgetState.totalCandidateBytesScanned -= unprocessedBatchBytes;
          currentTraversalFrame.nextEntryIndex =
            activeBatchEntry.entryIndexAfter ?? currentTraversalFrame.nextEntryIndex;
          activeFileRelativePath = activeBatchEntry.candidateRelativePath;
          activeFileMatchOffset = batchSearchResult.activeBatchEntryMatchOffset;
        }
      }

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
      !completeResultRequested,
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

  if (completeResultRequested && !searchAborted) {
    if (materializedExecutionPlan === null && traversalFrames.length > 0) {
      const materializationResult = await materializeFixedStringExecutionPlanFromTraversal({
        aggregateBudgetState,
        allowedDirectories,
        effectiveTraversalRuntimeBudgetLimits,
        executionPolicy,
        filePatterns,
        totalBytesScanned,
        traversalFrames,
        traversalNarrowingGuidance,
        traversalRuntimeBudgetState,
        traversalScopePolicyResolution,
        validRootPath,
      });

      materializedExecutionPlan = materializationResult.executionPlan;
      totalBytesScanned = materializationResult.totalBytesScanned;

      if (
        unsupportedStateReason === null
        && materializationResult.unsupportedStateReason !== null
      ) {
        unsupportedStateReason = materializationResult.unsupportedStateReason;
      }

      if (materializationResult.stopState.stopReason !== null) {
        searchStopState = materializationResult.stopState;
      }
    }

    if (!searchAborted && materializedExecutionPlan !== null) {
      const executionPlanResult = await executeMaterializedFixedStringExecutionPlan({
        caseSensitive,
        executionPlan: materializedExecutionPlan,
        executionPolicy,
        fixedString,
        resultsAlreadyCollected: results.length,
        rootResultLimit: admissionAdjustedMaxResults,
      });

      materializedExecutionPlan = executionPlanResult.executionPlan;
      filesSearched += executionPlanResult.filesSearched;
      matchesFound += executionPlanResult.totalMatches;
      results.push(...executionPlanResult.matches);

      if (executionPlanResult.searchAborted) {
        searchAborted = true;
        searchStopState = executionPlanResult.stopState;
        activeFileRelativePath = executionPlanResult.activeFileRelativePath;
        activeFileMatchOffset = executionPlanResult.activeFileMatchOffset;
      }
    }
  } else {
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
            effectiveTraversalRuntimeBudgetLimits,
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
            effectiveTraversalRuntimeBudgetLimits,
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
        const entryPolicy = await resolveTraversalScopeEntryPolicy(
          relativePath,
          entry.isDirectory(),
          traversalScopePolicyResolution,
        );

        if (entryPolicy.excluded) {
          commitInspectionResumeTraversalEntry(currentTraversalFrame);
          continue;
        }

        if (entry.isFile()) {
          if (!matchesPreviewLaneFilePatterns(relativePath, filePatterns)) {
            commitInspectionResumeTraversalEntry(currentTraversalFrame);
            continue;
          }
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
          if (entryPolicy.shouldTraverse) {
            traversalFrames.push({
              directoryRelativePath: rawRelativePath,
              nextEntryIndex: 0,
            });
            descendedIntoChildDirectory = true;
            break;
          }
          continue;
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

        if (useBatchedNativeExecutionPath) {
          const nextTotalBytesScanned = totalBytesScanned + candidateEntry.size;
          const nextAggregateBytesScanned =
            aggregateBudgetState.totalCandidateBytesScanned + candidateEntry.size;

          assertCandidateByteBudget(
            SEARCH_FIXED_STRING_TOOL_NAME,
            nextAggregateBytesScanned,
            executionPolicy.fixedStringServiceHardGapBytes,
            `fixed-string aggregate candidate bytes before reading ${candidateEntry.requestedPath}`,
          );

          aggregateBudgetState.totalCandidateBytesScanned = nextAggregateBytesScanned;
          totalBytesScanned = nextTotalBytesScanned;

          const textEligibility = await resolveTextEligibility(
            candidateEntry.validPath,
            candidateEntry.size,
          );
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
            await flushPendingNativeBatch(currentTraversalFrame);

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
              true,
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
              activeFileRelativePath = relativePath;
              activeFileMatchOffset = fileSearchResult.matches.length;
              commitInspectionResumeTraversalEntry(currentTraversalFrame);
              break;
            }

            commitInspectionResumeTraversalEntry(currentTraversalFrame);
            continue;
          }

          pendingNativeBatch.push({
            candidateEntry,
            candidateRelativePath: relativePath,
            entryIndexAfter: currentTraversalFrame.nextEntryIndex + 1,
          });
          commitInspectionResumeTraversalEntry(currentTraversalFrame);

          if (pendingNativeBatch.length >= SEARCH_FIXED_STRING_NATIVE_INLINE_BATCH_SIZE) {
            await flushPendingNativeBatch(currentTraversalFrame);

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
          true,
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

      if (searchAborted) {
        break;
      }

      if (!descendedIntoChildDirectory && currentTraversalFrame.nextEntryIndex >= entries.length) {
        traversalFrames.pop();
      }
    }

    if (useBatchedNativeExecutionPath && !searchAborted && pendingNativeBatch.length > 0) {
      await flushPendingNativeBatch();
    }
  }

  const hasRemainingTraversalWork =
    traversalFrames.length > 0
    || activeFileRelativePath !== null
    || materializedExecutionPlan !== null;
  const nextContinuationState = previewFirstAdmissionActive
    && hasRemainingTraversalWork
      ? {
          traversalFrames: cloneSearchFixedStringTraversalFrames(traversalFrames),
          activeFileRelativePath,
          activeFileMatchOffset,
          materializedExecutionPlan,
        }
      : null;

  const rootStopState = nextContinuationState !== null
    ? completeResultRequested
      ? createSearchCompletionContinuationState()
      : (
          searchStopState.stopReason === null
          || searchStopState.stopReason === SEARCH_STOP_REASON_LITERALS.MAX_RESULTS_LIMIT_REACHED
        )
        ? createSearchPreviewContinuationState()
        : searchStopState
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
