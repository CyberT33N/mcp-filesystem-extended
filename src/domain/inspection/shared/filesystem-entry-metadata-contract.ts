import { z } from "zod";

/**
 * Canonical filesystem entry categories used across inspection metadata surfaces.
 */
export type FileSystemEntryType = "directory" | "file" | "other";

/**
 * Timestamp metadata that can be requested as one grouped capability.
 */
export interface FileSystemEntryTimestamps {
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
}

/**
 * Permission metadata that can be requested as one grouped capability.
 */
export interface FileSystemEntryPermissions {
  /**
   * Filesystem permission bits rendered as the final three octal digits.
   */
  permissions: string;
}

/**
 * Grouped optional metadata flags shared by inspection endpoints.
 */
export interface FileSystemEntryMetadataSelection {
  /**
   * Whether the timestamp metadata group should be included.
   */
  timestamps: boolean;

  /**
   * Whether the permission metadata group should be included.
   */
  permissions: boolean;
}

/**
 * Canonical filesystem metadata shared by inspection endpoints.
 */
export interface FileSystemEntryMetadata
{
  /**
   * Entry type resolved from the current filesystem stats.
   */
  type: FileSystemEntryType;

  /**
   * Entry size in bytes.
   */
  size: number;

  /**
   * Entry creation timestamp in ISO-8601 format when the timestamp group is requested.
   */
  created?: string | undefined;

  /**
   * Entry last-modified timestamp in ISO-8601 format when the timestamp group is requested.
   */
  modified?: string | undefined;

  /**
   * Entry last-accessed timestamp in ISO-8601 format when the timestamp group is requested.
   */
  accessed?: string | undefined;

  /**
   * Filesystem permission bits rendered as the final three octal digits when the permission group is requested.
   */
  permissions?: string | undefined;
}

/**
 * Default grouped metadata selection used when callers do not request optional groups.
 */
export const DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION = {
  timestamps: false,
  permissions: false,
} as const satisfies FileSystemEntryMetadataSelection;

/**
 * Canonical schema for filesystem entry categories.
 */
export const FileSystemEntryTypeSchema = z.enum([
  "directory",
  "file",
  "other",
]);

/**
 * Canonical schema for grouped optional metadata selection.
 *
 * @remarks
 * This schema is the single source of truth for the `metadata` request object used by
 * the `get_path_metadata` and `list_directory_entries` endpoints. The infrastructure
 * metadata reader in `@infrastructure/filesystem/filesystem-entry-metadata` consumes
 * the parsed selection from this contract.
 */
export const FileSystemEntryMetadataSelectionSchema = z.object({
  timestamps: z
    .boolean()
    .optional()
    .default(DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION.timestamps)
    .describe(
      "Whether the grouped timestamp metadata (`created`, `modified`, `accessed`) should be included."
    ),
  permissions: z
    .boolean()
    .optional()
    .default(DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION.permissions)
    .describe(
      "Whether the grouped permission metadata (`permissions`) should be included."
    ),
});

/**
 * Defaulted input schema for grouped optional metadata selection.
 *
 * @remarks
 * Both `get_path_metadata` and `list_directory_entries` use this schema directly so the
 * two endpoints stay aligned on one input contract.
 */
export const DefaultedFileSystemEntryMetadataSelectionSchema =
  FileSystemEntryMetadataSelectionSchema.optional().default(
    DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION
  );

/**
 * Canonical structured metadata schema shared by inspection endpoints.
 *
 * @remarks
 * This schema is the single source of truth for the structured metadata returned by
 * `get_path_metadata` and reused inside the recursive `list_directory_entries`
 * result surface.
 */
export const FileSystemEntryMetadataSchema = z.object({
  type: FileSystemEntryTypeSchema,
  size: z.number(),
  created: z.string().optional(),
  modified: z.string().optional(),
  accessed: z.string().optional(),
  permissions: z.string().optional(),
});
