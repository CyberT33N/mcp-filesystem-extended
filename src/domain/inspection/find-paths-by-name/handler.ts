import {
  DISCOVERY_MAX_RESULTS_HARD_CAP,
  DISCOVERY_RESPONSE_CAP_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import { createInlineContinuationEnvelope } from "@domain/shared/continuation/inspection-continuation-contract";
import type {
  InspectionContinuationAdmission,
  InspectionContinuationMetadata,
} from "@domain/shared/continuation/inspection-continuation-contract";
import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
import { validatePath } from "@infrastructure/filesystem/path-guard";
import { formatBatchTextOperationResults } from "@infrastructure/formatting/batch-result-formatter";
import type { InspectionContinuationSqliteStore } from "@infrastructure/persistence/inspection-continuation-sqlite-store";

import { searchFiles } from "./helpers";

/**
 * Describes the structured name-search result for one requested root.
 *
 * @remarks
 * This contract preserves root-local matches and truncation state so callers
 * can distinguish complete traversal from a family-budget cutoff.
 */
export interface FindPathsByNameRootResult {
  root: string;
  matches: string[];
  truncated: boolean;
}

/**
 * Describes the structured name-search result across the full request batch.
 *
 * @remarks
 * The batch result aggregates per-root discovery output while keeping one
 * shared truncation signal for callers that need machine-readable breadth data.
 */
export interface FindPathsByNameResult {
  roots: FindPathsByNameRootResult[];
  totalMatches: number;
  truncated: boolean;
  admission: InspectionContinuationAdmission;
  continuation: InspectionContinuationMetadata;
}

async function getFindPathsByNameRootResult(
  directoryPath: string,
  pattern: string,
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  allowedDirectories: string[],
  maxResults: number,
): Promise<FindPathsByNameRootResult> {
  const validPath = await validatePath(directoryPath, allowedDirectories);
  const result = await searchFiles(
    validPath,
    pattern,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    allowedDirectories,
    maxResults,
  );

  return {
    root: directoryPath,
    matches: result.matches,
    truncated: result.truncated,
  };
}

async function getFormattedSearchFilesResult(
  directoryPath: string,
  pattern: string,
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  allowedDirectories: string[],
  maxResults: number,
): Promise<string> {
  const result = await getFindPathsByNameRootResult(
    directoryPath,
    pattern,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    allowedDirectories,
    maxResults,
  );

  if (result.matches.length === 0) {
    return "No matches found";
  }

  let output = result.matches.join("\n");

  if (result.truncated) {
    output += `\n(limited to ${maxResults} results)`;
  }

  assertActualTextBudget(
    "find_paths_by_name",
    output.length,
    DISCOVERY_RESPONSE_CAP_CHARS,
    "formatted name-based search results",
  );

  return output;
}

/**
 * Returns the structured name-search result for one or more requested roots.
 *
 * @remarks
 * Use this surface when callers need machine-readable discovery output while
 * still inheriting path validation, helper-driven traversal, and family-level
 * response-budget protection in downstream formatting layers.
 *
 * @param directoryPaths - Requested root directories in caller-supplied order.
 * @param pattern - Case-insensitive name substring applied to files and directories.
 * @param excludePatterns - Glob patterns removed from traversal before result collection.
 * @param includeExcludedGlobs - Explicit descendant re-include globs that may reopen excluded subtrees.
 * @param respectGitIgnore - Indicates whether optional root-local `.gitignore` enrichment should participate in traversal.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @param maxResults - Maximum number of matches retained per root before truncation.
 * @returns Structured per-root name-search results and aggregate totals.
 */
export async function getFindPathsByNameResult(
  _continuationToken: string | undefined,
  directoryPaths: string[],
  pattern: string,
  excludePatterns: string[],
  includeExcludedGlobs: string[] = [],
  respectGitIgnore = false,
  _inspectionContinuationStore: InspectionContinuationSqliteStore | undefined,
  allowedDirectories: string[],
  maxResults = DISCOVERY_MAX_RESULTS_HARD_CAP,
): Promise<FindPathsByNameResult> {
  const roots = await Promise.all(
    directoryPaths.map((directoryPath) =>
      getFindPathsByNameRootResult(
        directoryPath,
        pattern,
        excludePatterns,
        includeExcludedGlobs,
        respectGitIgnore,
        allowedDirectories,
        maxResults,
      )
    )
  );

  return {
    roots,
    totalMatches: roots.reduce((total, root) => total + root.matches.length, 0),
    truncated: roots.some((root) => root.truncated),
    ...createInlineContinuationEnvelope(),
  };
}

/**
 * Formats name-search results for the caller-visible text response surface.
 *
 * @remarks
 * This discovery entrypoint keeps name-based search broad enough for caller use
 * but still rejects oversized formatted output through the shared discovery
 * response budget instead of returning unbounded path lists.
 *
 * @param directoryPaths - Requested root directories in caller-supplied order.
 * @param pattern - Case-insensitive name substring applied to files and directories.
 * @param excludePatterns - Glob patterns removed from traversal before result collection.
 * @param includeExcludedGlobs - Explicit descendant re-include globs that may reopen excluded subtrees.
 * @param respectGitIgnore - Indicates whether optional root-local `.gitignore` enrichment should participate in traversal.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @param maxResults - Maximum number of matches retained per root before truncation.
 * @returns Human-readable name-search output bounded by the discovery-family text budget.
 */
export async function handleSearchFiles(
  continuationToken: string | undefined,
  directoryPaths: string[],
  pattern: string,
  excludePatterns: string[],
  includeExcludedGlobs: string[] = [],
  respectGitIgnore = false,
  inspectionContinuationStore: InspectionContinuationSqliteStore | undefined,
  allowedDirectories: string[],
  maxResults = DISCOVERY_MAX_RESULTS_HARD_CAP,
): Promise<string> {
  if (directoryPaths.length === 1) {
    const firstDirectoryPath = directoryPaths[0];

    if (firstDirectoryPath === undefined) {
      throw new Error("Expected one root path for name-based search.");
    }

    return getFormattedSearchFilesResult(
      firstDirectoryPath,
      pattern,
      excludePatterns,
      includeExcludedGlobs,
      respectGitIgnore,
      allowedDirectories,
      maxResults,
    );
  }

  const results = await Promise.all(
    directoryPaths.map(async (directoryPath) => {
      try {
        const output = await getFormattedSearchFilesResult(
          directoryPath,
          pattern,
          excludePatterns,
          includeExcludedGlobs,
          respectGitIgnore,
          allowedDirectories,
          maxResults,
        );
        return {
          label: directoryPath,
          output,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          label: directoryPath,
          error: errorMessage,
        };
      }
    })
  );

  const output = formatBatchTextOperationResults("search files", results);

  void continuationToken;
  void inspectionContinuationStore;

  assertActualTextBudget(
    "find_paths_by_name",
    output.length,
    DISCOVERY_RESPONSE_CAP_CHARS,
    "formatted batched name-based search results",
  );

  return output;
}
