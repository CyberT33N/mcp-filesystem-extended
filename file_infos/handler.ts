import fs from "fs/promises";
import { validatePath } from "../helpers/path.js";
import { formatBatchTextOperationResults } from "../helpers/batch.js";

export interface FileInfo {
  size: number;
  created: Date;
  modified: Date;
  accessed: Date;
  isDirectory: boolean;
  isFile: boolean;
  permissions: string;
}

export async function getFileStats(filePath: string): Promise<FileInfo> {
  const stats = await fs.stat(filePath);
  return {
    size: stats.size,
    created: stats.birthtime,
    modified: stats.mtime,
    accessed: stats.atime,
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile(),
    permissions: stats.mode.toString(8).slice(-3),
  };
}

async function getFormattedFileInfo(filePath: string, allowedDirectories: string[]): Promise<string> {
  const validPath = await validatePath(filePath, allowedDirectories);

  const stats = await fs.stat(validPath);
  const formattedInfo = {
    path: filePath,
    size: `${stats.size} bytes`,
    type: stats.isDirectory() ? "directory" : (stats.isFile() ? "file" : "other"),
    created: stats.birthtime.toISOString(),
    modified: stats.mtime.toISOString(),
    accessed: stats.atime.toISOString(),
    permissions: stats.mode.toString(8).slice(-3)
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
