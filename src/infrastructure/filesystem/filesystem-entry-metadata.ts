import fs from "fs/promises";
import type { Stats } from "fs";
import {
  DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
  type FileSystemEntryMetadata,
  type FileSystemEntryMetadataSelection,
  type FileSystemEntryPermissions,
  type FileSystemEntryTimestamps,
  type FileSystemEntryType,
} from "@domain/inspection/shared/filesystem-entry-metadata-contract";

function resolveFileSystemEntryType(stats: Stats): FileSystemEntryType {
  if (stats.isDirectory()) {
    return "directory";
  }

  if (stats.isFile()) {
    return "file";
  }

  return "other";
}

function resolveFileSystemEntryTimestamps(stats: Stats): FileSystemEntryTimestamps {
  return {
    created: stats.birthtime.toISOString(),
    modified: stats.mtime.toISOString(),
    accessed: stats.atime.toISOString(),
  };
}

function resolveFileSystemEntryPermissions(stats: Stats): FileSystemEntryPermissions {
  return {
    permissions: stats.mode.toString(8).slice(-3),
  };
}

/**
 * Reads canonical metadata for a validated filesystem path.
 *
 * @remarks
 * The grouped metadata contract is defined in
 * `@domain/inspection/shared/filesystem-entry-metadata-contract` and is reused by
 * the `get_path_metadata` and `list_directory_entries` endpoints so both surfaces
 * stay aligned on the same metadata selection behavior.
 *
 * @param filePath - Validated absolute filesystem path.
 * @param metadataSelection - Optional metadata groups to include in addition to required `size` and `type`.
 * @returns Canonical metadata shared by filesystem entry surfaces.
 */
export async function getFileSystemEntryMetadata(
  filePath: string,
  metadataSelection: FileSystemEntryMetadataSelection = DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION
): Promise<FileSystemEntryMetadata> {
  const stats = await fs.stat(filePath);

  let metadata: FileSystemEntryMetadata = {
    type: resolveFileSystemEntryType(stats),
    size: stats.size,
  };

  if (metadataSelection.timestamps) {
    metadata = {
      ...metadata,
      ...resolveFileSystemEntryTimestamps(stats),
    };
  }

  if (metadataSelection.permissions) {
    metadata = {
      ...metadata,
      ...resolveFileSystemEntryPermissions(stats),
    };
  }

  return metadata;
}
