import fs from "fs/promises";
import type { Stats } from "fs";

/**
 * Canonical filesystem entry categories used across filesystem metadata surfaces.
 */
export type FileSystemEntryType = "directory" | "file" | "other";

/**
 * Canonical metadata for one filesystem entry.
 */
export interface FileSystemEntryMetadata {
  /**
   * Entry type resolved from the current filesystem stats.
   */
  type: FileSystemEntryType;

  /**
   * Entry size in bytes.
   */
  size: number;

  /**
   * Entry creation timestamp in ISO-8601 format.
   */
  created: string;

  /**
   * Entry last-modified timestamp in ISO-8601 format.
   */
  modified: string;

  /**
   * Entry last-accessed timestamp in ISO-8601 format.
   */
  accessed: string;

  /**
   * Filesystem permission bits rendered as the final three octal digits.
   */
  permissions: string;
}

function resolveFileSystemEntryType(stats: Stats): FileSystemEntryType {
  if (stats.isDirectory()) {
    return "directory";
  }

  if (stats.isFile()) {
    return "file";
  }

  return "other";
}

/**
 * Reads canonical metadata for a validated filesystem path.
 *
 * @param filePath - Validated absolute filesystem path.
 * @returns Canonical metadata shared by filesystem entry surfaces.
 */
export async function getFileSystemEntryMetadata(
  filePath: string
): Promise<FileSystemEntryMetadata> {
  const stats = await fs.stat(filePath);

  return {
    type: resolveFileSystemEntryType(stats),
    size: stats.size,
    created: stats.birthtime.toISOString(),
    modified: stats.mtime.toISOString(),
    accessed: stats.atime.toISOString(),
    permissions: stats.mode.toString(8).slice(-3),
  };
}
