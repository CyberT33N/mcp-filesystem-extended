import { validatePath } from "../helpers/path.js";
import { formatBatchTextOperationResults } from "../helpers/batch.js";
import { getFileSystemEntryMetadata } from "./metadata.js";

async function getFormattedFileInfo(filePath: string, allowedDirectories: string[]): Promise<string> {
  const validPath = await validatePath(filePath, allowedDirectories);
  const metadata = await getFileSystemEntryMetadata(validPath);

  const formattedInfo = {
    path: filePath,
    size: `${metadata.size} bytes`,
    type: metadata.type,
    created: metadata.created,
    modified: metadata.modified,
    accessed: metadata.accessed,
    permissions: metadata.permissions,
  };

  return Object.entries(formattedInfo)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

export async function handleGetFileInfo(
  paths: string[],
  allowedDirectories: string[]
): Promise<string> {
  if (paths.length === 1) {
    return getFormattedFileInfo(paths[0], allowedDirectories);
  }

  const results = await Promise.all(
    paths.map(async (filePath) => {
      try {
        const output = await getFormattedFileInfo(filePath, allowedDirectories);
        return {
          label: filePath,
          output,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          label: filePath,
          error: errorMessage,
        };
      }
    })
  );

  return formatBatchTextOperationResults("file info", results);
}
