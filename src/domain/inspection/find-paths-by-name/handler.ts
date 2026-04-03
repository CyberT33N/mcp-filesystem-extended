import { validatePath } from "@infrastructure/filesystem/path-guard.js";
import { formatBatchTextOperationResults } from "@infrastructure/formatting/batch-result-formatter.js";

import { searchFiles } from "./helpers.js";

export interface FindPathsByNameRootResult {
  root: string;
  matches: string[];
}

export interface FindPathsByNameResult {
  roots: FindPathsByNameRootResult[];
  totalMatches: number;
}

async function getFindPathsByNameRootResult(
  directoryPath: string,
  pattern: string,
  excludePatterns: string[],
  allowedDirectories: string[]
): Promise<FindPathsByNameRootResult> {
  const validPath = await validatePath(directoryPath, allowedDirectories);
  const matches = await searchFiles(validPath, pattern, excludePatterns, allowedDirectories);

  return {
    root: directoryPath,
    matches,
  };
}

async function getFormattedSearchFilesResult(
  directoryPath: string,
  pattern: string,
  excludePatterns: string[],
  allowedDirectories: string[]
): Promise<string> {
  const result = await getFindPathsByNameRootResult(
    directoryPath,
    pattern,
    excludePatterns,
    allowedDirectories
  );
  return result.matches.length > 0 ? result.matches.join("\n") : "No matches found";
}

export async function getFindPathsByNameResult(
  directoryPaths: string[],
  pattern: string,
  excludePatterns: string[],
  allowedDirectories: string[]
): Promise<FindPathsByNameResult> {
  const roots = await Promise.all(
    directoryPaths.map((directoryPath) =>
      getFindPathsByNameRootResult(
        directoryPath,
        pattern,
        excludePatterns,
        allowedDirectories
      )
    )
  );

  return {
    roots,
    totalMatches: roots.reduce((total, root) => total + root.matches.length, 0),
  };
}

export async function handleSearchFiles(
  directoryPaths: string[],
  pattern: string,
  excludePatterns: string[],
  allowedDirectories: string[]
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
      allowedDirectories
    );
  }

  const results = await Promise.all(
    directoryPaths.map(async (directoryPath) => {
      try {
        const output = await getFormattedSearchFilesResult(
          directoryPath,
          pattern,
          excludePatterns,
          allowedDirectories
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

  return formatBatchTextOperationResults("search files", results);
}
