import fs from "fs/promises";
import path from "path";

import { readGitIgnoreTraversalEnrichmentForRoot } from "@domain/shared/guardrails/gitignore-traversal-enrichment";
import {
  assertCandidateByteBudget,
  assertExpectedFileTypes,
  collectValidatedFilesystemPreflightEntries,
  type FilesystemPreflightEntry,
} from "@domain/shared/guardrails/filesystem-preflight";
import { normalizeRegexMatchExcerpt } from "@domain/shared/guardrails/regex-search-safety";
import {
  assertTraversalRuntimeBudget,
  createTraversalRuntimeBudgetState,
  recordTraversalDirectoryVisit,
  recordTraversalEntryVisit,
} from "@domain/shared/guardrails/traversal-runtime-budget";
import {
  resolveTraversalScopePolicy,
  shouldExcludeTraversalScopePath,
  shouldTraverseTraversalScopeDirectoryPath,
} from "@domain/shared/guardrails/traversal-scope-policy";
import {
  PATTERN_CLASSIFICATION_LITERALS,
  type PatternClassification,
} from "@domain/shared/search/pattern-classifier";
import {
  resolveSearchExecutionPolicy,
  type SearchExecutionPolicy,
} from "@domain/shared/search/search-execution-policy";
import { classifyTextBinarySurface } from "@domain/shared/search/text-binary-classifier";
import { REGEX_SEARCH_MAX_RESULTS_HARD_CAP } from "@domain/shared/guardrails/tool-guardrail-limits";
import { buildUgrepCommand } from "@infrastructure/search/ugrep-command-builder";
import { runUgrepSearch } from "@infrastructure/search/ugrep-runner";
import { detectIoCapabilityProfile } from "@infrastructure/runtime/io-capability-detector";
import { minimatch } from "minimatch";

import {
  type FixedStringSearchMatch,
  type SearchFixedStringPathResult,
} from "./search-fixed-string-result";

const SEARCH_FIXED_STRING_TOOL_NAME = "search_file_contents_by_fixed_string";
const TEXT_BINARY_PROBE_SAMPLE_BYTES = 4_096;

/**
 * Mutable aggregate budget state shared across all requested fixed-string roots.
 *
 * @remarks
 * The fixed-string endpoint keeps one request-level candidate-byte accounting surface so later
 * roots do not silently reset large-workload accounting back to zero.
 */
export interface FixedStringSearchAggregateBudgetState {
  /**
   * Aggregate candidate bytes scanned across the current request.
   */
  totalCandidateBytesScanned: number;
}

/**
 * Creates the canonical request-aggregate budget state for one fixed-string request.
 *
 * @returns Fresh aggregate accounting state with zero scanned candidate bytes.
 */
export function createFixedStringSearchAggregateBudgetState(): FixedStringSearchAggregateBudgetState {
  return {
    totalCandidateBytesScanned: 0,
  };
}

function createFixedStringPatternClassification(fixedString: string): PatternClassification {
  return {
    classification: PATTERN_CLASSIFICATION_LITERALS.literal,
    originalPattern: fixedString,
    requiresPcre2: false,
    supportsLiteralFastPath: true,
  };
}

function matchesIncludedFilePatterns(candidatePath: string, filePatterns: string[]): boolean {
  if (filePatterns.length === 0) {
    return true;
  }

  const fileName = path.basename(candidatePath);

  return filePatterns.some((filePattern) => minimatch(fileName, filePattern, { nocase: true }));
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

async function resolveTextEligibility(candidatePath: string): Promise<{
  classificationReason: string;
  isTextEligible: boolean;
}> {
  const initialClassification = classifyTextBinarySurface({ candidatePath });

  if (initialClassification.isTextEligible) {
    return initialClassification;
  }

  const contentSample = await readTextBinaryProbeSample(candidatePath);

  if (contentSample === null) {
    return initialClassification;
  }

  return classifyTextBinarySurface({
    candidatePath,
    contentSample,
  });
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

function collectFixedStringLineMatches(
  lineContent: string,
  fixedString: string,
  caseSensitive: boolean,
): string[] {
  if (fixedString.length === 0) {
    return [];
  }

  const normalizedLine = caseSensitive ? lineContent : lineContent.toLowerCase();
  const normalizedNeedle = caseSensitive ? fixedString : fixedString.toLowerCase();
  const matches: string[] = [];
  let searchFromIndex = 0;

  while (searchFromIndex <= normalizedLine.length - normalizedNeedle.length) {
    const matchIndex = normalizedLine.indexOf(normalizedNeedle, searchFromIndex);

    if (matchIndex < 0) {
      break;
    }

    matches.push(lineContent.slice(matchIndex, matchIndex + fixedString.length));
    searchFromIndex = matchIndex + fixedString.length;
  }

  return matches;
}

function createFixedStringRootErrorResult(
  searchPath: string,
  errorMessage: string,
): SearchFixedStringPathResult {
  return {
    root: searchPath,
    matches: [],
    filesSearched: 0,
    totalMatches: 0,
    truncated: false,
    error: errorMessage,
  };
}

async function getValidatedPreflightEntry(
  requestedPath: string,
  allowedDirectories: string[],
): Promise<FilesystemPreflightEntry> {
  const entries = await collectValidatedFilesystemPreflightEntries(
    SEARCH_FIXED_STRING_TOOL_NAME,
    [requestedPath],
    allowedDirectories,
  );
  const firstEntry = entries[0];

  if (firstEntry === undefined) {
    throw new Error(`Expected one validated preflight entry for path: ${requestedPath}`);
  }

  return firstEntry;
}

async function getValidatedSearchScopeEntry(
  searchPath: string,
  allowedDirectories: string[],
): Promise<FilesystemPreflightEntry> {
  const rootEntry = await getValidatedPreflightEntry(searchPath, allowedDirectories);

  assertExpectedFileTypes(
    SEARCH_FIXED_STRING_TOOL_NAME,
    [rootEntry],
    ["file", "directory"],
  );

  return rootEntry;
}

async function collectFixedStringMatchesFromFileEntry(
  candidateEntry: FilesystemPreflightEntry,
  fixedString: string,
  filePatterns: string[],
  caseSensitive: boolean,
  executionPolicy: SearchExecutionPolicy,
  aggregateBudgetState: FixedStringSearchAggregateBudgetState,
  refuseUnsupportedFileScope: boolean,
  maxAdditionalResults: number,
  totalBytesScannedBeforeRead: number,
): Promise<{
  matches: FixedStringSearchMatch[];
  fileSearched: boolean;
  totalMatches: number;
  totalBytesScanned: number;
  truncated: boolean;
}> {
  if (!matchesIncludedFilePatterns(candidateEntry.validPath, filePatterns)) {
    return {
      matches: [],
      fileSearched: false,
      totalMatches: 0,
      totalBytesScanned: totalBytesScannedBeforeRead,
      truncated: false,
    };
  }

  const nextTotalBytesScanned = totalBytesScannedBeforeRead + candidateEntry.size;
  const nextAggregateBytesScanned = aggregateBudgetState.totalCandidateBytesScanned + candidateEntry.size;

  assertCandidateByteBudget(
    SEARCH_FIXED_STRING_TOOL_NAME,
    nextAggregateBytesScanned,
    executionPolicy.fixedStringServiceHardGapBytes,
    `fixed-string aggregate candidate bytes before reading ${candidateEntry.requestedPath}`,
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
    };
  }

  if (maxAdditionalResults <= 0) {
    return {
      matches: [],
      fileSearched: true,
      totalMatches: 0,
      totalBytesScanned: nextTotalBytesScanned,
      truncated: true,
    };
  }

  const previewFirstTriggered = nextAggregateBytesScanned > executionPolicy.fixedStringSyncCandidateBytesCap;
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
    patternClassification: createFixedStringPatternClassification(fixedString),
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
        content: normalizeRegexMatchExcerpt(parsedLine.lineContent, matchedText),
        match: matchedText,
      });

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
  };
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
  const searchScopeEntry = await getValidatedSearchScopeEntry(searchPath, allowedDirectories);
  const effectiveMaxResults = Math.min(maxResults, REGEX_SEARCH_MAX_RESULTS_HARD_CAP);

  if (searchScopeEntry.type === "file") {
    const fileSearchResult = await collectFixedStringMatchesFromFileEntry(
      searchScopeEntry,
      fixedString,
      filePatterns,
      caseSensitive,
      executionPolicy,
      aggregateBudgetState,
      true,
      effectiveMaxResults,
      0,
    );

    return {
      root: searchPath,
      matches: fileSearchResult.matches,
      filesSearched: fileSearchResult.fileSearched ? 1 : 0,
      totalMatches: fileSearchResult.totalMatches,
      truncated: fileSearchResult.truncated,
      error: null,
    };
  }

  const validRootPath = searchScopeEntry.validPath;
  const gitIgnoreTraversalEnrichment = respectGitIgnore
    ? await readGitIgnoreTraversalEnrichmentForRoot(validRootPath)
    : null;
  const traversalScopePolicyResolution = resolveTraversalScopePolicy(
    searchPath,
    excludePatterns,
    {
      includeExcludedGlobs,
      respectGitIgnore,
      gitIgnoreTraversalEnrichment,
    },
  );
  const traversalRuntimeBudgetState = createTraversalRuntimeBudgetState();
  const results: FixedStringSearchMatch[] = [];
  let filesSearched = 0;
  let matchesFound = 0;
  let searchAborted = false;
  let totalBytesScanned = 0;

  async function searchDirectory(dirPath: string, currentRelativePath: string): Promise<void> {
    if (searchAborted) {
      return;
    }

    recordTraversalDirectoryVisit(traversalRuntimeBudgetState);
    assertTraversalRuntimeBudget(SEARCH_FIXED_STRING_TOOL_NAME, traversalRuntimeBudgetState);

    let entryNames: string[];

    try {
      entryNames = await fs.readdir(dirPath);
    } catch {
      return;
    }

    for (const entryName of entryNames) {
      if (searchAborted) {
        break;
      }

      recordTraversalEntryVisit(traversalRuntimeBudgetState);
      assertTraversalRuntimeBudget(SEARCH_FIXED_STRING_TOOL_NAME, traversalRuntimeBudgetState);

      const fullPath = path.join(dirPath, entryName);
      let candidateEntry: FilesystemPreflightEntry;

      try {
        candidateEntry = await getValidatedPreflightEntry(fullPath, allowedDirectories);
      } catch {
        continue;
      }

      const rawRelativePath = currentRelativePath === ""
        ? entryName
        : path.join(currentRelativePath, entryName);
      const relativePath = rawRelativePath.split(path.sep).join("/");
      const shouldTraverseExcludedDirectory = candidateEntry.type === "directory"
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

      if (candidateEntry.type === "directory") {
        await searchDirectory(candidateEntry.validPath, rawRelativePath);
        continue;
      }

      if (candidateEntry.type !== "file") {
        continue;
      }

      const fileSearchResult = await collectFixedStringMatchesFromFileEntry(
        candidateEntry,
        fixedString,
        filePatterns,
        caseSensitive,
        executionPolicy,
        aggregateBudgetState,
        false,
        effectiveMaxResults - results.length,
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
    truncated: searchAborted,
    error: null,
  };
}
