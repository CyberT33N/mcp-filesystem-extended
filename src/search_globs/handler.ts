import fs from "fs/promises";
import path from "path";
import { validatePath } from "../helpers/path.js";
import { minimatch } from "minimatch";
import { formatBatchTextOperationResults } from "../helpers/batch.js";

async function getFormattedSearchGlobResult(
  searchPath: string,
  pattern: string,
  excludePatterns: string[],
  maxResults: number,
  allowedDirectories: string[]
): Promise<string> {
  const validRootPath = await validatePath(searchPath, allowedDirectories);

  const results: string[] = [];
  let searchAborted = false;

  async function findMatches(currentPath: string) {
    if (searchAborted) return;

    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (searchAborted) break;

        const fullPath = path.join(currentPath, entry.name);

        try {
          await validatePath(fullPath, allowedDirectories);

          const relativePath = path.relative(validRootPath, fullPath);
          const shouldExclude = excludePatterns.some((excludePattern) => {
            return minimatch(relativePath, excludePattern, { dot: true });
          });

          if (shouldExclude) {
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
            await findMatches(fullPath);
          }
        } catch (error) {
          continue;
        }
      }
    } catch (error) {
      return;
    }
  }

  await findMatches(validRootPath);

  if (results.length === 0) {
    return `No files matching pattern: ${pattern}`;
  }

  let output = `Found ${results.length} files matching pattern: ${pattern}`;
  if (searchAborted) {
    output += ` (limited to ${maxResults} results)`;
  }
  output += "\n\n";

  results.sort();

  for (const result of results) {
    output += `${result}\n`;
  }

  return output.trimEnd();
}

export async function handleSearchGlob(
  searchPaths: string[],
  pattern: string,
  excludePatterns: string[],
  maxResults: number,
  allowedDirectories: string[]
): Promise<string> {
  if (searchPaths.length === 1) {
    return getFormattedSearchGlobResult(
      searchPaths[0],
      pattern,
      excludePatterns,
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

  return formatBatchTextOperationResults("search glob", results);
}
