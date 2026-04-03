import {
  getFileSystemEntryMetadata,
  type FileSystemEntryMetadata,
} from "@infrastructure/filesystem/filesystem-entry-metadata.js";
import { validatePath } from "@infrastructure/filesystem/path-guard.js";
import { formatBatchTextOperationResults } from "@infrastructure/formatting/batch-result-formatter.js";

export interface PathMetadataEntry extends FileSystemEntryMetadata {
  path: string;
}

export interface PathMetadataError {
  path: string;
  error: string;
}

export interface PathMetadataResult {
  entries: PathMetadataEntry[];
  errors: PathMetadataError[];
}

async function getPathMetadataEntry(
  filePath: string,
  allowedDirectories: string[]
): Promise<PathMetadataEntry> {
  const validPath = await validatePath(filePath, allowedDirectories);
  const metadata = await getFileSystemEntryMetadata(validPath);

  return {
    path: filePath,
    ...metadata,
  };
}

function formatPathMetadataEntry(entry: PathMetadataEntry): string {
  const formattedInfo = {
    path: entry.path,
    size: `${entry.size} bytes`,
    type: entry.type,
    created: entry.created,
    modified: entry.modified,
    accessed: entry.accessed,
    permissions: entry.permissions,
  };

  return Object.entries(formattedInfo)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

export async function getPathMetadataResult(
  paths: string[],
  allowedDirectories: string[]
): Promise<PathMetadataResult> {
  const results = await Promise.all(
    paths.map(async (filePath) => {
      try {
        return {
          entry: await getPathMetadataEntry(filePath, allowedDirectories),
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        return {
          error: {
            path: filePath,
            error: errorMessage,
          },
        };
      }
    })
  );

  return {
    entries: results.flatMap((result) => (result.entry ? [result.entry] : [])),
    errors: results.flatMap((result) => (result.error ? [result.error] : [])),
  };
}

export async function handleGetFileInfo(
  paths: string[],
  allowedDirectories: string[]
): Promise<string> {
  if (paths.length === 1) {
    const firstPath = paths[0];

    if (firstPath === undefined) {
      throw new Error("Expected one path for file metadata lookup.");
    }

    return formatPathMetadataEntry(
      await getPathMetadataEntry(firstPath, allowedDirectories)
    );
  }

  const result = await getPathMetadataResult(paths, allowedDirectories);

  const results = [
    ...result.entries.map((entry) => ({
      label: entry.path,
      output: formatPathMetadataEntry(entry),
    })),
    ...result.errors.map((error) => ({
      label: error.path,
      error: error.error,
    })),
  ];

  return formatBatchTextOperationResults("file info", results);
}
