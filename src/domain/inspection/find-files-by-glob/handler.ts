import fs from "fs/promises";
import path from "path";
import { readGitIgnoreTraversalEnrichmentForRoot } from "@domain/shared/guardrails/gitignore-traversal-enrichment";
import {
  resolveTraversalScopePolicy,
  shouldExcludeTraversalScopePath,
  shouldTraverseTraversalScopeDirectoryPath,
} from "@domain/shared/guardrails/traversal-scope-policy";
import { DISCOVERY_RESPONSE_CAP_CHARS } from "@domain/shared/guardrails/tool-guardrail-limits";
import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
import { validatePath } from "@infrastructure/filesystem/path-guard";
import { formatBatchTextOperationResults } from "@infrastructure/formatting/batch-result-formatter";

import { minimatch } from "minimatch";

/**
 * Describes the structured glob-search result for one requested root.
 *
 * @remarks
 * This contract preserves root-local matches and truncation state so discovery
 * callers can distinguish normal completion from family-budget cutoffs.
 */
export interface FindFilesByGlobRootResult {
  root: string;
  matches: string[];
  truncated: boolean;
}

/**
 * Describes the structured glob-search result across the full request batch.
 *
 * @remarks
 * The batch result aggregates per-root discovery output while keeping one
 * shared truncation signal for callers that need machine-readable breadth data.
 */
export interface FindFilesByGlobResult {
  roots: FindFilesByGlobRootResult[];
  totalMatches: number;
  truncated: boolean;
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

async function getFindFilesByGlobRootResult(
  searchPath: string,
  pattern: string,
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  maxResults: number,
  allowedDirectories: string[]
): Promise<FindFilesByGlobRootResult> {
  const validRootPath = await validatePath(searchPath, allowedDirectories);
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
    }
  );

  const results: string[] = [];
  let searchAborted = false;

  async function findMatches(currentPath: string, currentRelativePath: string) {
    if (searchAborted) return;

    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (searchAborted) break;

        const fullPath = path.join(currentPath, entry.name);

        try {
          await validatePath(fullPath, allowedDirectories);

          const rawRelativePath =
            currentRelativePath === ""
              ? entry.name
              : path.join(currentRelativePath, entry.name);
          const relativePath = normalizeRelativePath(rawRelativePath);
          const shouldTraverseExcludedDirectory =
            entry.isDirectory() &&
            shouldTraverseTraversalScopeDirectoryPath(
              relativePath,
              traversalScopePolicyResolution
            );

          if (
            shouldExcludeTraversalScopePath(relativePath, traversalScopePolicyResolution) &&
            !shouldTraverseExcludedDirectory
          ) {
            continue;
          }

          if (minimatch(relativePath, pattern, { dot: true })) {
            results.push(fullPath);

            if (results.length >= maxResults) {
              searchAborted = true;
              break;
            }
          }

          if (entry.isDirectory()) {
            await findMatches(fullPath, rawRelativePath);
          }
        } catch (error) {
          continue;
        }
      }
    } catch (error) {
      return;
    }
  }

  await findMatches(validRootPath, "");

  return {
    root: searchPath,
    matches: results,
    truncated: searchAborted,
  };
}

async function getFormattedSearchGlobResult(
  searchPath: string,
  pattern: string,
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  maxResults: number,
  allowedDirectories: string[]
): Promise<string> {
  const result = await getFindFilesByGlobRootResult(
    searchPath,
    pattern,
    excludePatterns,
    includeExcludedGlobs,
    respectGitIgnore,
    maxResults,
    allowedDirectories
  );

  if (result.matches.length === 0) {
    return `No files matching pattern: ${pattern}`;
  }

  let output = `Found ${result.matches.length} files matching pattern: ${pattern}`;
  if (result.truncated) {
    output += ` (limited to ${maxResults} results)`;
  }
  output += "\n\n";

  result.matches.sort();

  for (const match of result.matches) {
    output += `${match}\n`;
  }

  output = output.trimEnd();

  assertActualTextBudget(
    "find_files_by_glob",
    output.length,
    DISCOVERY_RESPONSE_CAP_CHARS,
    "formatted glob search results",
  );

  return output;
}

/**
 * Returns the structured glob-search result for one or more requested roots.
 *
 * @remarks
 * Use this surface when callers need machine-readable discovery output while
 * still inheriting path validation, root-local truncation, and family-level
 * response-budget protection in downstream formatting layers.
 *
 * @param searchPaths - Requested root directories in caller-supplied order.
 * @param pattern - Glob expression applied to relative paths beneath each root.
 * @param excludePatterns - Glob patterns removed from traversal before result collection.
 * @param includeExcludedGlobs - Additive descendant re-include globs that reopen excluded subtrees.
 * @param respectGitIgnore - Whether optional root-local `.gitignore` enrichment participates.
 * @param maxResults - Maximum number of matches retained per root before truncation.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @returns Structured per-root glob-search results and aggregate totals.
 */
export async function getFindFilesByGlobResult(
  searchPaths: string[],
  pattern: string,
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  maxResults: number,
  allowedDirectories: string[]
): Promise<FindFilesByGlobResult> {
  const roots = await Promise.all(
    searchPaths.map((searchPath) =>
      getFindFilesByGlobRootResult(
        searchPath,
        pattern,
        excludePatterns,
        includeExcludedGlobs,
        respectGitIgnore,
        maxResults,
        allowedDirectories
      )
    )
  );

  return {
    roots,
    totalMatches: roots.reduce((total, root) => total + root.matches.length, 0),
    truncated: roots.some((root) => root.truncated),
  };
}

/**
 * Formats glob-search results for the caller-visible text response surface.
 *
 * @remarks
 * This discovery entrypoint keeps file enumeration broad enough for caller use
 * but still enforces a bounded match ceiling and rejects oversize formatted
 * output through the shared discovery response budget.
 *
 * @param searchPaths - Requested root directories in caller-supplied order.
 * @param pattern - Glob expression applied to relative paths beneath each root.
 * @param excludePatterns - Glob patterns removed from traversal before result collection.
 * @param includeExcludedGlobs - Additive descendant re-include globs that reopen excluded subtrees.
 * @param respectGitIgnore - Whether optional root-local `.gitignore` enrichment participates.
 * @param maxResults - Maximum number of matches retained per root before truncation.
 * @param allowedDirectories - Allowed root directories enforced by the shared path guard.
 * @returns Human-readable glob-search output bounded by the discovery-family text budget.
 */
export async function handleSearchGlob(
  searchPaths: string[],
  pattern: string,
  excludePatterns: string[],
  includeExcludedGlobs: string[],
  respectGitIgnore: boolean,
  maxResults: number,
  allowedDirectories: string[]
): Promise<string> {
  if (searchPaths.length === 1) {
    const firstSearchPath = searchPaths[0];

    if (firstSearchPath === undefined) {
      throw new Error("Expected one root path for glob-based search.");
    }

    return getFormattedSearchGlobResult(
      firstSearchPath,
      pattern,
      excludePatterns,
      includeExcludedGlobs,
      respectGitIgnore,
      maxResults,
      allowedDirectories
    );
  }

  const results = await Promise.all(
    searchPaths.map(async (searchPath) => {
      try {
        const output = await getFormattedSearchGlobResult(
          searchPath,
          pattern,
          excludePatterns,
          includeExcludedGlobs,
          respectGitIgnore,
          maxResults,
          allowedDirectories
        );
        return {
          label: searchPath,
          output,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          label: searchPath,
          error: errorMessage,
        };
      }
    })
  );

  const output = formatBatchTextOperationResults("search glob", results);

  assertActualTextBudget(
    "find_files_by_glob",
    output.length,
    DISCOVERY_RESPONSE_CAP_CHARS,
    "formatted batched glob search results",
  );

  return output;
}
