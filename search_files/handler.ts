import { validatePath } from "../helpers/path.js";
import { searchFiles } from "./helpers.js";
import { formatBatchTextOperationResults } from "../helpers/batch.js";

async function getFormattedSearchFilesResult(
  directoryPath: string,
  pattern: string,
  excludePatterns: string[],
  allowedDirectories: string[]
): Promise<string> {
  const validPath = await validatePath(directoryPath, allowedDirectories);
  const results = await searchFiles(validPath, pattern, excludePatterns, allowedDirectories);
  return results.length > 0 ? results.join("\n") : "No matches found";
}

export async function handleSearchFiles(
  directoryPaths: string[],
  pattern: string,
  excludePatterns: string[],
  allowedDirectories: string[]
): Promise<string> {
  if (directoryPaths.length === 1) {
    return getFormattedSearchFilesResult(directoryPaths[0], pattern, excludePatterns, allowedDirectories);
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
