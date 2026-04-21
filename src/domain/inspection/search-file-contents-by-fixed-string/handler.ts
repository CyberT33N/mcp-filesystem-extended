import { REGEX_SEARCH_MAX_RESULTS_HARD_CAP } from "@domain/shared/guardrails/tool-guardrail-limits";
import { resolveSearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";
import { createInlineContinuationEnvelope } from "@domain/shared/continuation/inspection-continuation-contract";
import { formatBatchTextOperationResults } from "@infrastructure/formatting/batch-result-formatter";
import { detectIoCapabilityProfile } from "@infrastructure/runtime/io-capability-detector";
import type { InspectionContinuationSqliteStore } from "@infrastructure/persistence/inspection-continuation-sqlite-store";
import {
  assertFormattedFixedStringResponseBudget,
  formatSearchFixedStringPathOutput,
  type SearchFixedStringPathResult,
  type SearchFixedStringResult,
} from "./search-fixed-string-result";
import { createFixedStringSearchAggregateBudgetState } from "./fixed-string-search-aggregate-budget-state";
import { getSearchFixedStringPathResult } from "./search-fixed-string-path-result";
import { createFixedStringRootErrorResult } from "./fixed-string-search-support";

const SEARCH_FIXED_STRING_TOOL_NAME = "search_file_contents_by_fixed_string";

/**
 * Executes fixed-string search across one or more roots and returns the formatted text response surface.
 *
 * @param searchPaths - File or directory search scopes in caller-supplied order.
 * @param fixedString - Exact literal string supplied by the caller.
 * @param filePatterns - Include globs that narrow candidate file names before content scanning.
 * @param excludePatterns - Exclude globs that remove candidate paths from traversal.
 * @param includeExcludedGlobs - Additive descendant re-include globs that reopen excluded subtrees.
 * @param respectGitIgnore - Whether optional root-local `.gitignore` enrichment participates in traversal.
 * @param maxResults - Caller-requested maximum number of returned locations per root.
 * @param caseSensitive - Whether literal matching should preserve case sensitivity.
 * @param allowedDirectories - Allowed directory roots enforced by the shared path guard.
 * @returns Formatted text output that respects the shared search-family response cap.
 */
export async function handleSearchFixedString(
  searchPaths: string[],
  fixedString: string,
  filePatterns: string[],
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  maxResults: number,
  caseSensitive: boolean,
  allowedDirectories: string[],
): Promise<string> {
  const effectiveMaxResults = Math.min(maxResults, REGEX_SEARCH_MAX_RESULTS_HARD_CAP);
  const aggregateBudgetState = createFixedStringSearchAggregateBudgetState();
  const executionPolicy = resolveSearchExecutionPolicy(detectIoCapabilityProfile());

  if (searchPaths.length === 1) {
    const firstSearchPath = searchPaths[0];

    if (firstSearchPath === undefined) {
      throw new Error("Expected one root path for fixed-string content search.");
    }

    const result = await getSearchFixedStringPathResult(
      firstSearchPath,
      fixedString,
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

    return assertFormattedFixedStringResponseBudget(
      SEARCH_FIXED_STRING_TOOL_NAME,
      formatSearchFixedStringPathOutput(result, fixedString, effectiveMaxResults),
    );
  }

  const results: Array<
    | { label: string; output: string }
    | { label: string; error: string }
  > = [];

  for (const searchPath of searchPaths) {
    try {
      const result = await getSearchFixedStringPathResult(
        searchPath,
        fixedString,
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
        output: formatSearchFixedStringPathOutput(result, fixedString, effectiveMaxResults),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      results.push({
        label: searchPath,
        error: errorMessage,
      });
    }
  }

  return assertFormattedFixedStringResponseBudget(
    SEARCH_FIXED_STRING_TOOL_NAME,
    formatBatchTextOperationResults("search fixed string", results),
  );
}

/**
 * Executes fixed-string search across one or more roots and returns the structured result surface.
 *
 * @param searchPaths - File or directory search scopes in caller-supplied order.
 * @param fixedString - Exact literal string supplied by the caller.
 * @param filePatterns - Include globs that narrow candidate file names before content scanning.
 * @param excludePatterns - Exclude globs that remove candidate paths from traversal.
 * @param includeExcludedGlobs - Additive descendant re-include globs that reopen excluded subtrees.
 * @param respectGitIgnore - Whether optional root-local `.gitignore` enrichment participates in traversal.
 * @param maxResults - Caller-requested maximum number of returned locations per root.
 * @param caseSensitive - Whether literal matching should preserve case sensitivity.
 * @param allowedDirectories - Allowed directory roots enforced by the shared path guard.
 * @returns Structured per-root results with harmonized partial-failure semantics.
 */
export async function getSearchFixedStringResult(
  _continuationToken: string | undefined,
  searchPaths: string[],
  fixedString: string,
  filePatterns: string[],
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  maxResults: number,
  caseSensitive: boolean,
  allowedDirectories: string[],
  _inspectionContinuationStore?: InspectionContinuationSqliteStore,
): Promise<SearchFixedStringResult> {
  const effectiveMaxResults = Math.min(maxResults, REGEX_SEARCH_MAX_RESULTS_HARD_CAP);
  const aggregateBudgetState = createFixedStringSearchAggregateBudgetState();
  const executionPolicy = resolveSearchExecutionPolicy(detectIoCapabilityProfile());

  if (searchPaths.length === 1) {
    const firstSearchPath = searchPaths[0];

    if (firstSearchPath === undefined) {
      throw new Error("Expected one root path for fixed-string content search.");
    }

    const result = await getSearchFixedStringPathResult(
      firstSearchPath,
      fixedString,
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
      ...createInlineContinuationEnvelope(),
    };
  }

  const roots: SearchFixedStringPathResult[] = [];

  for (const searchPath of searchPaths) {
    try {
      const result = await getSearchFixedStringPathResult(
        searchPath,
        fixedString,
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

      roots.push(createFixedStringRootErrorResult(searchPath, errorMessage));
    }
  }

  return {
    roots,
    totalLocations: roots.reduce((total, root) => total + root.matches.length, 0),
    totalMatches: roots.reduce((total, root) => total + root.totalMatches, 0),
    truncated: roots.some((root) => root.truncated),
    ...createInlineContinuationEnvelope(),
  };
}
