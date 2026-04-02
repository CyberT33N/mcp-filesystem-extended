import { validatePath } from "../helpers/path.js";
import { buildDirectoryTree } from "./helpers.js";
import { formatBatchTextOperationResults } from "../helpers/batch.js";

async function getFormattedDirectoryTree(
  directoryPath: string,
  excludePatterns: string[],
  allowedDirectories: string[]
): Promise<string> {
  const validRootPath = await validatePath(directoryPath, allowedDirectories);
  const treeData = await buildDirectoryTree(
    validRootPath,
    validRootPath,
    excludePatterns,
    allowedDirectories
  );

  return JSON.stringify(treeData, null, 2);
}

export async function handleDirectoryTree(
  directoryPaths: string[],
  excludePatterns: string[],
  allowedDirectories: string[]
): Promise<string> {
  if (directoryPaths.length === 1) {
    return getFormattedDirectoryTree(directoryPaths[0], excludePatterns, allowedDirectories);
  }

  const results = await Promise.all(
    directoryPaths.map(async (directoryPath) => {
      try {
        const output = await getFormattedDirectoryTree(directoryPath, excludePatterns, allowedDirectories);
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

  return formatBatchTextOperationResults("directory tree", results);
}
