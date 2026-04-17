import { formatBatchTextOperationResults } from "@infrastructure/formatting/batch-result-formatter";

import { compileGuardrailedSearchRegex } from "@domain/shared/guardrails/regex-search-safety";
import { REGEX_SEARCH_MAX_RESULTS_HARD_CAP } from "@domain/shared/guardrails/tool-guardrail-limits";
import { resolveSearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";
import { detectIoCapabilityProfile } from "@infrastructure/runtime/io-capability-detector";

import {
  createRegexSearchAggregateBudgetState,
  getSearchRegexPathResult,
} from "./search-regex-path-result";
import {
  assertFormattedRegexResponseBudget,
  formatSearchRegexPathOutput,
  type SearchRegexPathResult,
  type SearchRegexResult,
} from "./search-regex-result";

const SEARCH_REGEX_TOOL_NAME = "search_file_contents_by_regex";

function createRegexRootErrorResult(
  searchPath: string,
  errorMessage: string,
): SearchRegexPathResult {
  return {
    root: searchPath,
    matches: [],
    filesSearched: 0,
    totalMatches: 0,
    truncated: false,
    error: errorMessage,
  };
}

function createSharedRegexExecutionContext(
  pattern: string,
  caseSensitive: boolean,
): {
  aggregateBudgetState: ReturnType<typeof createRegexSearchAggregateBudgetState>;
  executionPolicy: ReturnType<typeof resolveSearchExecutionPolicy>;
} {
  compileGuardrailedSearchRegex(SEARCH_REGEX_TOOL_NAME, pattern, caseSensitive);

  return {
    aggregateBudgetState: createRegexSearchAggregateBudgetState(),
    executionPolicy: resolveSearchExecutionPolicy(detectIoCapabilityProfile()),
  };
}

/**
 * Executes regex search across one or more roots and returns the formatted text response surface.
 *
 * @remarks
 * This handler preserves the public regex endpoint contract while delegating the heavy execution
 * lane to endpoint-local helper modules that consume the shared runtime policy, classifiers, and
 * native `ugrep` backend. Invalid regex patterns remain global failures, while multi-root runtime
 * problems are preserved as root-local failures instead of collapsing the whole batch response.
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
  const { aggregateBudgetState, executionPolicy } = createSharedRegexExecutionContext(
    pattern,
    caseSensitive,
  );

  if (searchPaths.length === 1) {
    const firstSearchPath = searchPaths[0];

    if (firstSearchPath === undefined) {
      throw new Error("Expected one root path for regex content search.");
    }

    const result = await getSearchRegexPathResult(
      SEARCH_REGEX_TOOL_NAME,
      firstSearchPath,
      pattern,
      filePatterns,
      excludePatterns,
      includeExcludedGlobs,
      respectGitIgnore,
      effectiveMaxResults,
      caseSensitive,
      allowedDirectories,
      executionPolicy,
      aggregateBudgetState,
    );

    return assertFormattedRegexResponseBudget(
      SEARCH_REGEX_TOOL_NAME,
      formatSearchRegexPathOutput(result, pattern, effectiveMaxResults),
    );
  }

  const results: Array<
    | { label: string; output: string }
    | { label: string; error: string }
  > = [];

  for (const searchPath of searchPaths) {
    try {
      const result = await getSearchRegexPathResult(
        SEARCH_REGEX_TOOL_NAME,
        searchPath,
        pattern,
        filePatterns,
        excludePatterns,
        includeExcludedGlobs,
        respectGitIgnore,
        effectiveMaxResults,
        caseSensitive,
        allowedDirectories,
        executionPolicy,
        aggregateBudgetState,
      );

      results.push({
        label: searchPath,
        output: formatSearchRegexPathOutput(result, pattern, effectiveMaxResults),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      results.push({
        label: searchPath,
        error: errorMessage,
      });
    }
  }

  return assertFormattedRegexResponseBudget(
    SEARCH_REGEX_TOOL_NAME,
    formatBatchTextOperationResults("search regex", results),
  );
}

/**
 * Executes regex search across one or more roots and returns the structured result surface.
 *
 * @remarks
 * Structured callers consume the same shared runtime policy, native backend, and aggregate budget
 * state as the formatted handler. Single-root requests preserve strict failures, while multi-root
 * requests encode root-local failures inside the per-root result surface so later consumers can
 * distinguish partial root failures from successful roots.
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
 * @returns Structured per-root results with preserved field names and harmonized failure semantics.
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
  const { aggregateBudgetState, executionPolicy } = createSharedRegexExecutionContext(
    pattern,
    caseSensitive,
  );

  if (searchPaths.length === 1) {
    const firstSearchPath = searchPaths[0];

    if (firstSearchPath === undefined) {
      throw new Error("Expected one root path for regex content search.");
    }

    const result = await getSearchRegexPathResult(
      SEARCH_REGEX_TOOL_NAME,
      firstSearchPath,
      pattern,
      filePatterns,
      excludePatterns,
      includeExcludedGlobs,
      respectGitIgnore,
      effectiveMaxResults,
      caseSensitive,
      allowedDirectories,
      executionPolicy,
      aggregateBudgetState,
    );

    return {
      roots: [result],
      totalLocations: result.matches.length,
      totalMatches: result.totalMatches,
      truncated: result.truncated,
    };
  }

  const roots: SearchRegexPathResult[] = [];

  for (const searchPath of searchPaths) {
    try {
      const result = await getSearchRegexPathResult(
        SEARCH_REGEX_TOOL_NAME,
        searchPath,
        pattern,
        filePatterns,
        excludePatterns,
        includeExcludedGlobs,
        respectGitIgnore,
        effectiveMaxResults,
        caseSensitive,
        allowedDirectories,
        executionPolicy,
        aggregateBudgetState,
      );

      roots.push(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      roots.push(createRegexRootErrorResult(searchPath, errorMessage));
    }
  }

  return {
    roots,
    totalLocations: roots.reduce((total, root) => total + root.matches.length, 0),
    totalMatches: roots.reduce((total, root) => total + root.totalMatches, 0),
    truncated: roots.some((root) => root.truncated),
  };
}
