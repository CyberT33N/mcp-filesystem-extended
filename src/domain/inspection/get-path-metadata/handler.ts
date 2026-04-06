import {
  DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
  type FileSystemEntryMetadata,
  type FileSystemEntryMetadataSelection,
} from "@domain/inspection/shared/filesystem-entry-metadata-contract";
import { getFileSystemEntryMetadata } from "@infrastructure/filesystem/filesystem-entry-metadata";
import { validatePath } from "@infrastructure/filesystem/path-guard";
import { formatBatchTextOperationResults } from "@infrastructure/formatting/batch-result-formatter";

/**
 * Structured metadata entry returned by the `get_path_metadata` tool.
 */
export interface PathMetadataEntry extends FileSystemEntryMetadata {
  /**
   * Path exactly as requested by the caller.
   */
  path: string;
}

/**
 * Error surface returned when one requested path could not be resolved.
 */
export interface PathMetadataError {
  /**
   * Path exactly as requested by the caller.
   */
  path: string;

  /**
   * Human-readable error message describing the lookup failure.
   */
  error: string;
}

/**
 * Structured result returned by the `get_path_metadata` tool.
 */
export interface PathMetadataResult {
  /**
   * Successfully resolved metadata entries in request order.
   */
  entries: PathMetadataEntry[];

  /**
   * Lookup errors for requested paths that could not be resolved.
   */
  errors: PathMetadataError[];
}

async function getPathMetadataEntry(
  filePath: string,
  metadataSelection: FileSystemEntryMetadataSelection,
  allowedDirectories: string[]
): Promise<PathMetadataEntry> {
  const validPath = await validatePath(filePath, allowedDirectories);
  const metadata = await getFileSystemEntryMetadata(validPath, metadataSelection);

  return {
    path: filePath,
    ...metadata,
  };
}

function formatPathMetadataEntry(entry: PathMetadataEntry): string {
  const lines: Array<[string, string]> = [
    ["path", entry.path],
    ["size", `${entry.size} bytes`],
    ["type", entry.type],
  ];

  if (entry.created !== undefined) {
    lines.push(["created", entry.created]);
  }

  if (entry.modified !== undefined) {
    lines.push(["modified", entry.modified]);
  }

  if (entry.accessed !== undefined) {
    lines.push(["accessed", entry.accessed]);
  }

  if (entry.permissions !== undefined) {
    lines.push(["permissions", entry.permissions]);
  }

  return lines.map(([key, value]) => `${key}: ${value}`).join("\n");
}

/**
 * Builds the structured `get_path_metadata` result.
 *
 * @param paths - File or directory paths to inspect.
 * @param metadataSelection - Grouped optional metadata flags. `size` and `type` remain required defaults.
 * @param allowedDirectories - Allowed directory roots used during path validation.
 * @returns Structured metadata lookup result.
 */
export async function getPathMetadataResult(
  paths: string[],
  metadataSelection: FileSystemEntryMetadataSelection = DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
  allowedDirectories: string[]
): Promise<PathMetadataResult> {
  const results = await Promise.all(
    paths.map(async (filePath) => {
      try {
        return {
          entry: await getPathMetadataEntry(
            filePath,
            metadataSelection,
            allowedDirectories
          ),
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

/**
 * Formats the `get_path_metadata` result as text output.
 *
 * @param paths - File or directory paths to inspect.
 * @param metadataSelection - Grouped optional metadata flags. `size` and `type` remain required defaults.
 * @param allowedDirectories - Allowed directory roots used during path validation.
 * @returns Text output for the metadata lookup.
 */
export async function handleGetPathMetadata(
  paths: string[],
  metadataSelection: FileSystemEntryMetadataSelection = DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
  allowedDirectories: string[]
): Promise<string> {
  if (paths.length === 1) {
    const firstPath = paths[0];

    if (firstPath === undefined) {
      throw new Error("Expected one path for file metadata lookup.");
    }

    return formatPathMetadataEntry(
      await getPathMetadataEntry(
        firstPath,
        metadataSelection,
        allowedDirectories
      )
    );
  }

  const result = await getPathMetadataResult(
    paths,
    metadataSelection,
    allowedDirectories
  );

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

  return formatBatchTextOperationResults("path metadata", results);
}
