import fs from "fs/promises";
import path from "path";
import { formatBatchTextOperationResults } from "@infrastructure/formatting/batch-result-formatter";

import { readGitIgnoreTraversalEnrichmentForRoot } from "@domain/shared/guardrails/gitignore-traversal-enrichment";
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

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
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

/**
 * Resolves one regex search scope after shared filesystem preflight succeeds.
 *
 * @remarks
 * The shared filesystem preflight remains intentionally generic. This helper owns the regex
 * endpoint decision to accept both explicit file scopes and directory scopes without pushing that
 * mixed-scope contract down into the shared guardrail core.
 *
 * @param searchPath - Caller-supplied file or directory scope.
 * @param allowedDirectories - Allowed directory roots enforced by the shared path guard.
 * @returns One validated file or directory entry ready for endpoint-specific execution.
 */
async function getValidatedSearchScopeEntry(
  searchPath: string,
  allowedDirectories: string[],
): Promise<FilesystemPreflightEntry> {
  const rootEntry = await getValidatedPreflightEntry(searchPath, allowedDirectories);

  assertExpectedFileTypes(SEARCH_REGEX_TOOL_NAME, [rootEntry], ["file", "directory"]);

  return rootEntry;
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
 * Executes guarded regex matching against one validated file entry.
 *
 * @remarks
 * Explicit file scopes intentionally skip traversal-only guardrails because the caller already
 * targeted one concrete file. Candidate-byte budgets, regex runtime budgets, and final response
 * budgets still remain fully active for this direct-file search path.
 *
 * @param candidateEntry - Validated file entry selected for regex evaluation.
 * @param filePatterns - Include globs that may still narrow the validated file scope.
 * @param regex - Compiled regex instance that already passed the shared runtime-safety gate.
 * @param maxAdditionalResults - Maximum number of additional match locations that may still be collected.
 * @param totalBytesScannedBeforeRead - Candidate-byte total accumulated before this file is considered.
 * @param collectedLocationsBeforeRead - Match-location total accumulated before this file is considered.
 * @returns Match data, byte accounting, and truncation state for the validated file entry.
 */
async function collectRegexMatchesFromFileEntry(
  candidateEntry: FilesystemPreflightEntry,
  filePatterns: string[],
  regex: RegExp,
  maxAdditionalResults: number,
  totalBytesScannedBeforeRead: number,
  collectedLocationsBeforeRead: number,
): Promise<{
  matches: SearchResult[];
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

  assertCandidateByteBudget(
    SEARCH_REGEX_TOOL_NAME,
    nextTotalBytesScanned,
    REGEX_SEARCH_MAX_CANDIDATE_BYTES,
    `regex candidate bytes before reading ${candidateEntry.requestedPath}`,
  );

  let content: string;

  try {
    content = await fs.readFile(candidateEntry.validPath, "utf-8");
  } catch {
    return {
      matches: [],
      fileSearched: true,
      totalMatches: 0,
      totalBytesScanned: nextTotalBytesScanned,
      truncated: false,
    };
  }

  const lines = content.split("\n");
  const matches: SearchResult[] = [];
  let totalMatches = 0;
  let match: RegExpExecArray | null;
  let truncated = false;

  resetRegexLastIndex(regex);

  while ((match = regex.exec(content)) !== null) {
    totalMatches++;

    const { lineNumber, lineContent } = getLineMatchContext(lines, match.index);

    matches.push({
      file: candidateEntry.validPath,
      line: lineNumber,
      content: normalizeRegexMatchExcerpt(lineContent, match[0]),
      match: match[0],
    });

    assertRegexRuntimeBudget(
      SEARCH_REGEX_TOOL_NAME,
      collectedLocationsBeforeRead + matches.length,
      nextTotalBytesScanned,
    );

    if (matches.length >= maxAdditionalResults) {
      truncated = true;
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
 * Describes the structured regex-search result for one validated search scope.
 *
 * @remarks
 * This contract captures the runtime-shaped search surface after the regex pipeline applies a tiny
 * structural reject layer, endpoint-specific file-versus-directory scope normalization,
 * candidate-byte preflights, result-count budgets, and final response-size protection.
 */
export interface SearchRegexPathResult {
  /**
   * Original search scope path supplied by the caller.
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
 * The batch result preserves per-scope runtime fuse outcomes so callers can see where direct file
 * search or guarded directory traversal stopped without implying that broad blacklists or caller
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
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  maxResults: number,
  caseSensitive: boolean,
  allowedDirectories: string[],
): Promise<SearchRegexPathResult> {
  const searchScopeEntry = await getValidatedSearchScopeEntry(searchPath, allowedDirectories);
  const regex = compileGuardrailedSearchRegex(SEARCH_REGEX_TOOL_NAME, pattern, caseSensitive);
  const effectiveMaxResults = Math.min(maxResults, REGEX_SEARCH_MAX_RESULTS_HARD_CAP);

  if (searchScopeEntry.type === "file") {
    const fileSearchResult = await collectRegexMatchesFromFileEntry(
      searchScopeEntry,
      filePatterns,
      regex,
      effectiveMaxResults,
      0,
      0,
    );

    return {
      root: searchPath,
      matches: fileSearchResult.matches,
      filesSearched: fileSearchResult.fileSearched ? 1 : 0,
      totalMatches: fileSearchResult.totalMatches,
      truncated: fileSearchResult.truncated,
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

  const results: SearchResult[] = [];
  let filesSearched = 0;
  let matchesFound = 0;
  let searchAborted = false;
  let totalBytesScanned = 0;

  async function searchDirectory(
    dirPath: string,
    currentRelativePath: string,
  ): Promise<void> {
    if (searchAborted) {
      return;
    }

    recordTraversalDirectoryVisit(traversalRuntimeBudgetState);
    assertTraversalRuntimeBudget(SEARCH_REGEX_TOOL_NAME, traversalRuntimeBudgetState);

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
      assertTraversalRuntimeBudget(SEARCH_REGEX_TOOL_NAME, traversalRuntimeBudgetState);

      const fullPath = path.join(dirPath, entryName);
      let candidateEntry: FilesystemPreflightEntry;

      try {
        candidateEntry = await getValidatedPreflightEntry(fullPath, allowedDirectories);
      } catch {
        continue;
      }

      const rawRelativePath =
        currentRelativePath === ""
          ? entryName
          : path.join(currentRelativePath, entryName);
      const relativePath = normalizeRelativePath(rawRelativePath);
      const shouldTraverseExcludedDirectory =
        candidateEntry.type === "directory" &&
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

      if (candidateEntry.type === "directory") {
        await searchDirectory(candidateEntry.validPath, rawRelativePath);
        continue;
      }

      if (candidateEntry.type !== "file") {
        continue;
      }

      if (!matchesIncludedFilePatterns(candidateEntry.validPath, filePatterns)) {
        continue;
      }

      const fileSearchResult = await collectRegexMatchesFromFileEntry(
        candidateEntry,
        filePatterns,
        regex,
        effectiveMaxResults - results.length,
        totalBytesScanned,
        results.length,
      );

      if (fileSearchResult.fileSearched) {
        filesSearched++;
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
  };
}

/**
 * Executes regex search across one or more roots and returns the formatted text response surface.
 *
 * @remarks
 * This entrypoint keeps regex safety layered: schema caps narrow the request, the shared runtime
 * helper rejects only structurally unsafe patterns, the endpoint-specific scope normalizer accepts
 * both explicit file scopes and directory scopes, and the handler then enforces candidate-byte,
 * match-count, and final response-budget limits instead of relying on a broad semantic blacklist.
 *
 * @param searchPaths - File or directory search scopes in caller-supplied order.
 * @param pattern - Raw regex pattern supplied by the caller.
 * @param filePatterns - Include globs that narrow candidate file names before content scanning.
 * @param excludePatterns - Exclude globs that remove candidate paths from traversal.
 * @param includeExcludedGlobs - Additive descendant re-include globs that reopen excluded subtrees.
 * @param respectGitIgnore - Whether optional root-local `.gitignore` enrichment participates in traversal.
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
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
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
      includeExcludedGlobs,
      respectGitIgnore,
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
          includeExcludedGlobs,
          respectGitIgnore,
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
 * Use this surface when callers need machine-readable regex output while still inheriting the same
 * structural reject layer, hybrid file-versus-directory scope normalization, runtime budgets, and
 * non-bypassable response-cap behavior as the formatted handler entrypoint.
 *
 * @param searchPaths - File or directory search scopes in caller-supplied order.
 * @param pattern - Raw regex pattern supplied by the caller.
 * @param filePatterns - Include globs that narrow candidate file names before content scanning.
 * @param excludePatterns - Exclude globs that remove candidate paths from traversal.
 * @param includeExcludedGlobs - Additive descendant re-include globs that reopen excluded subtrees.
 * @param respectGitIgnore - Whether optional root-local `.gitignore` enrichment participates in traversal.
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
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
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
        includeExcludedGlobs,
        respectGitIgnore,
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
