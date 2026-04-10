import fs from "fs/promises";
import path from "path";
import { formatBatchTextOperationResults } from "@infrastructure/formatting/batch-result-formatter";

import { minimatch } from "minimatch";

import {
  assertCandidateByteBudget,
  assertExpectedFileTypes,
  collectValidatedFilesystemPreflightEntries,
  type FilesystemPreflightEntry,
} from "@domain/shared/guardrails/filesystem-preflight";
import {
  assertRegexRuntimeBudget,
  compileGuardrailedSearchRegex,
  normalizeRegexMatchExcerpt,
  resetRegexLastIndex,
} from "@domain/shared/guardrails/regex-search-safety";
import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
import {
  REGEX_SEARCH_MAX_CANDIDATE_BYTES,
  REGEX_SEARCH_MAX_RESULTS_HARD_CAP,
  REGEX_SEARCH_RESPONSE_CAP_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";

const SEARCH_REGEX_TOOL_NAME = "search_file_contents_by_regex";

interface SearchResult {
  file: string;
  line: number;
  content: string;
  match: string;
}

function getExcludeGlobPattern(excludePattern: string): string {
  return excludePattern.includes("*") ? excludePattern : `**/${excludePattern}/**`;
}

function isExcludedPath(relativePath: string, excludePatterns: string[]): boolean {
  return excludePatterns.some((excludePattern) =>
    minimatch(relativePath, getExcludeGlobPattern(excludePattern), { dot: true }),
  );
}

function matchesIncludedFilePatterns(candidatePath: string, filePatterns: string[]): boolean {
  if (filePatterns.length === 0) {
    return true;
  }

  const fileName = path.basename(candidatePath);

  return filePatterns.some((filePattern) => minimatch(fileName, filePattern, { nocase: true }));
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

async function getValidatedPreflightEntry(
  requestedPath: string,
  allowedDirectories: string[],
): Promise<FilesystemPreflightEntry> {
  const entries = await collectValidatedFilesystemPreflightEntries(
    SEARCH_REGEX_TOOL_NAME,
    [requestedPath],
    allowedDirectories,
  );
  const firstEntry = entries[0];

  if (firstEntry === undefined) {
    throw new Error(`Expected one validated preflight entry for path: ${requestedPath}`);
  }

  return firstEntry;
}

async function getValidatedRootPath(
  searchPath: string,
  allowedDirectories: string[],
): Promise<string> {
  const rootEntry = await getValidatedPreflightEntry(searchPath, allowedDirectories);

  assertExpectedFileTypes(SEARCH_REGEX_TOOL_NAME, [rootEntry], ["directory"]);

  return rootEntry.validPath;
}

function formatSearchRegexPathOutput(
  result: SearchRegexPathResult,
  pattern: string,
  effectiveMaxResults: number,
): string {
  if (result.matches.length === 0) {
    return `No matches found for regex: ${pattern}\nSearched ${result.filesSearched} files`;
  }

  let output = `Found ${result.totalMatches} matches in ${result.matches.length} locations`;

  if (result.truncated) {
    output += ` (limited to ${effectiveMaxResults} results)`;
  }

  output += "\n\n";

  const fileGroups = new Map<string, SearchResult[]>();

  for (const match of result.matches) {
    if (!fileGroups.has(match.file)) {
      fileGroups.set(match.file, []);
    }

    fileGroups.get(match.file)?.push(match);
  }

  for (const [file, fileResults] of fileGroups.entries()) {
    output += `File: ${file}\n`;

    for (const fileResult of fileResults) {
      output += `  Line ${fileResult.line}: ${fileResult.content}\n`;
    }

    output += "\n";
  }

  return output.trimEnd();
}

function assertFormattedRegexResponseBudget(formattedOutput: string): string {
  assertActualTextBudget(
    SEARCH_REGEX_TOOL_NAME,
    formattedOutput.length,
    REGEX_SEARCH_RESPONSE_CAP_CHARS,
    "Regex search response exceeds the regex-search family cap.",
  );

  return formattedOutput;
}

/**
 * Describes the structured regex-search result for one validated search root.
 *
 * @remarks
 * This contract captures the runtime-shaped search surface after the regex
 * pipeline applies a tiny structural reject layer, candidate-byte preflights,
 * result-count budgets, and final response-size protection.
 */
export interface SearchRegexPathResult {
  /**
   * Original root path supplied by the caller.
   */
  root: string;

  /**
   * Collected match locations that survived runtime guardrail enforcement.
   */
  matches: SearchResult[];

  /**
   * Number of candidate files examined under the root while budgets permitted scanning.
   */
  filesSearched: number;

  /**
   * Number of regex matches encountered before truncation or traversal completion.
   */
  totalMatches: number;

  /**
   * Indicates whether result collection stopped early because the effective result limit was reached.
   */
  truncated: boolean;
}

/**
 * Describes the structured regex-search result across all requested roots.
 *
 * @remarks
 * The batch result preserves per-root runtime fuse outcomes so callers can see
 * where traversal stopped without implying that broad blacklists or caller
 * overrides exist for the regex safety model.
 */
export interface SearchRegexResult {
  /**
   * Per-root structured results in caller-supplied order.
   */
  roots: SearchRegexPathResult[];

  /**
   * Total number of collected match locations across all roots.
   */
  totalLocations: number;

  /**
   * Total number of matches encountered across all roots.
   */
  totalMatches: number;

  /**
   * Indicates whether any root result stopped early because the effective result limit was reached.
   */
  truncated: boolean;
}

async function getSearchRegexPathResult(
  searchPath: string,
  pattern: string,
  filePatterns: string[],
  excludePatterns: string[],
  maxResults: number,
  caseSensitive: boolean,
  allowedDirectories: string[],
): Promise<SearchRegexPathResult> {
  const validRootPath = await getValidatedRootPath(searchPath, allowedDirectories);
  const regex = compileGuardrailedSearchRegex(SEARCH_REGEX_TOOL_NAME, pattern, caseSensitive);
  const effectiveMaxResults = Math.min(maxResults, REGEX_SEARCH_MAX_RESULTS_HARD_CAP);

  const results: SearchResult[] = [];
  let filesSearched = 0;
  let matchesFound = 0;
  let searchAborted = false;
  let totalBytesScanned = 0;

  async function searchDirectory(dirPath: string): Promise<void> {
    if (searchAborted) {
      return;
    }

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

      const fullPath = path.join(dirPath, entryName);
      let candidateEntry: FilesystemPreflightEntry;

      try {
        candidateEntry = await getValidatedPreflightEntry(fullPath, allowedDirectories);
      } catch {
        continue;
      }

      const relativePath = path.relative(validRootPath, candidateEntry.validPath);

      if (isExcludedPath(relativePath, excludePatterns)) {
        continue;
      }

      if (candidateEntry.type === "directory") {
        await searchDirectory(candidateEntry.validPath);
        continue;
      }

      if (candidateEntry.type !== "file") {
        continue;
      }

      if (!matchesIncludedFilePatterns(candidateEntry.validPath, filePatterns)) {
        continue;
      }

      filesSearched++;

      const nextTotalBytesScanned = totalBytesScanned + candidateEntry.size;

      assertCandidateByteBudget(
        SEARCH_REGEX_TOOL_NAME,
        nextTotalBytesScanned,
        REGEX_SEARCH_MAX_CANDIDATE_BYTES,
        `regex candidate bytes before reading ${candidateEntry.requestedPath}`,
      );

      totalBytesScanned = nextTotalBytesScanned;

      let content: string;

      try {
        content = await fs.readFile(candidateEntry.validPath, "utf-8");
      } catch {
        continue;
      }

      const lines = content.split("\n");
      let match: RegExpExecArray | null;

      resetRegexLastIndex(regex);

      while ((match = regex.exec(content)) !== null) {
        matchesFound++;

        const { lineNumber, lineContent } = getLineMatchContext(lines, match.index);

        results.push({
          file: candidateEntry.validPath,
          line: lineNumber,
          content: normalizeRegexMatchExcerpt(lineContent, match[0]),
          match: match[0],
        });

        assertRegexRuntimeBudget(SEARCH_REGEX_TOOL_NAME, results.length, totalBytesScanned);

        if (results.length >= effectiveMaxResults) {
          searchAborted = true;
          break;
        }
      }
    }
  }

  await searchDirectory(validRootPath);

  return {
    root: searchPath,
    matches: results,
    filesSearched,
    totalMatches: matchesFound,
    truncated: searchAborted,
  };
}

/**
 * Executes regex search across one or more roots and returns the formatted text response surface.
 *
 * @remarks
 * This entrypoint keeps regex safety layered: schema caps narrow the request,
 * the shared runtime helper rejects only structurally unsafe patterns, and the
 * handler then enforces candidate-byte, match-count, and final response-budget
 * limits instead of relying on a broad semantic blacklist.
 *
 * @param searchPaths - Root directories to search in caller-supplied order.
 * @param pattern - Raw regex pattern supplied by the caller.
 * @param filePatterns - Include globs that narrow candidate file names before content scanning.
 * @param excludePatterns - Exclude globs that remove candidate paths from traversal.
 * @param maxResults - Caller-requested maximum number of returned locations per root.
 * @param caseSensitive - Whether regex compilation should preserve case sensitivity.
 * @param allowedDirectories - Allowed directory roots enforced by the shared path guard.
 * @returns Formatted text output that respects the regex-search family response cap.
 */
export async function handleSearchRegex(
  searchPaths: string[],
  pattern: string,
  filePatterns: string[],
  excludePatterns: string[],
  maxResults: number,
  caseSensitive: boolean,
  allowedDirectories: string[],
): Promise<string> {
  const effectiveMaxResults = Math.min(maxResults, REGEX_SEARCH_MAX_RESULTS_HARD_CAP);

  if (searchPaths.length === 1) {
    const firstSearchPath = searchPaths[0];

    if (firstSearchPath === undefined) {
      throw new Error("Expected one root path for regex content search.");
    }

    const result = await getSearchRegexPathResult(
      firstSearchPath,
      pattern,
      filePatterns,
      excludePatterns,
      effectiveMaxResults,
      caseSensitive,
      allowedDirectories,
    );

    return assertFormattedRegexResponseBudget(
      formatSearchRegexPathOutput(result, pattern, effectiveMaxResults),
    );
  }

  const results = await Promise.all(
    searchPaths.map(async (searchPath) => {
      try {
        const result = await getSearchRegexPathResult(
          searchPath,
          pattern,
          filePatterns,
          excludePatterns,
          effectiveMaxResults,
          caseSensitive,
          allowedDirectories,
        );

        return {
          label: searchPath,
          output: formatSearchRegexPathOutput(result, pattern, effectiveMaxResults),
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        return {
          label: searchPath,
          error: errorMessage,
        };
      }
    }),
  );

  return assertFormattedRegexResponseBudget(
    formatBatchTextOperationResults("search regex", results),
  );
}

/**
 * Executes regex search across one or more roots and returns the structured result surface.
 *
 * @remarks
 * Use this surface when callers need machine-readable regex output while still
 * inheriting the same structural reject layer, runtime budgets, and non-bypassable
 * response-cap behavior as the formatted handler entrypoint.
 *
 * @param searchPaths - Root directories to search in caller-supplied order.
 * @param pattern - Raw regex pattern supplied by the caller.
 * @param filePatterns - Include globs that narrow candidate file names before content scanning.
 * @param excludePatterns - Exclude globs that remove candidate paths from traversal.
 * @param maxResults - Caller-requested maximum number of returned locations per root.
 * @param caseSensitive - Whether regex compilation should preserve case sensitivity.
 * @param allowedDirectories - Allowed directory roots enforced by the shared path guard.
 * @returns Structured per-root results with preserved field names and runtime guardrail shaping.
 */
export async function getSearchRegexResult(
  searchPaths: string[],
  pattern: string,
  filePatterns: string[],
  excludePatterns: string[],
  maxResults: number,
  caseSensitive: boolean,
  allowedDirectories: string[],
): Promise<SearchRegexResult> {
  const effectiveMaxResults = Math.min(maxResults, REGEX_SEARCH_MAX_RESULTS_HARD_CAP);
  const roots = await Promise.all(
    searchPaths.map((searchPath) =>
      getSearchRegexPathResult(
        searchPath,
        pattern,
        filePatterns,
        excludePatterns,
        effectiveMaxResults,
        caseSensitive,
        allowedDirectories,
      ),
    ),
  );

  return {
    roots,
    totalLocations: roots.reduce((total, root) => total + root.matches.length, 0),
    totalMatches: roots.reduce((total, root) => total + root.totalMatches, 0),
    truncated: roots.some((root) => root.truncated),
  };
}
