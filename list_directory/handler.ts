import fs from "fs/promises";
import { validatePath } from "../helpers/path.js";
import { formatBatchTextOperationResults } from "../helpers/batch.js";

async function getFormattedDirectoryListing(directoryPath: string, allowedDirectories: string[]): Promise<string> {
  const validPath = await validatePath(directoryPath, allowedDirectories);
  const entries = await fs.readdir(validPath, { withFileTypes: true });

  return entries
    .map((entry) => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`)
    .join("\n");
}

export async function handleListDirectory(
  directoryPaths: string[], 
  allowedDirectories: string[]
): Promise<string> {
  if (directoryPaths.length === 1) {
    return getFormattedDirectoryListing(directoryPaths[0], allowedDirectories);
  }

  const results = await Promise.all(
    directoryPaths.map(async (directoryPath) => {
      try {
        const output = await getFormattedDirectoryListing(directoryPath, allowedDirectories);
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

  return formatBatchTextOperationResults("directory listing", results);
}
