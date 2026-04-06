import { z } from "zod";
import type { FileSystemEntryMetadata } from "@domain/inspection/shared/filesystem-entry-metadata-contract";
import {
  DefaultedFileSystemEntryMetadataSelectionSchema,
  FileSystemEntryMetadataSchema,
} from "@domain/inspection/shared/filesystem-entry-metadata-contract";

/**
 * Input schema for the `list_directory_entries` tool.
 */
export const ListDirectoryEntriesArgsSchema = z.object({
  roots: z
    .array(z.string())
    .min(1)
    .describe(
      "Paths to directories to list. Pass one path for a single listing root or multiple paths for batch listing roots."
    ),
  recursive: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Whether nested directory content should be traversed recursively. Set to false to return only same-level files and directories for each requested root."
    ),
  metadata: DefaultedFileSystemEntryMetadataSelectionSchema.describe(
    "Optional grouped metadata selectors. `size` and `type` are always returned. Set `timestamps` and/or `permissions` to true to include those groups."
  ),
  excludeGlobs: z
    .array(z.string())
    .optional()
    .default([])
    .describe(
      "Glob-like patterns for entries that should be excluded from the structured listing output."
    ),
});

/**
 * Structured directory entry returned by the directory-entry listing result.
 */
interface ListedDirectoryEntryOutput extends FileSystemEntryMetadata {
  /**
   * Leaf entry name.
   */
  name: string;

  /**
   * Entry path relative to the requested root path.
   */
  path: string;

  /**
   * Nested child entries when recursive traversal is enabled.
   */
  children?: ListedDirectoryEntryOutput[] | undefined;
}

/**
 * Structured listing root returned for one requested directory path.
 */
interface ListedDirectoryRootOutput {
  /**
   * Directory path exactly as requested by the caller.
   */
  requestedPath: string;

  /**
   * Structured entries rooted beneath the requested path.
   */
  entries: ListedDirectoryEntryOutput[];
}

/**
 * Structured result returned by the directory-entry listing surface.
 */
interface ListDirectoryEntriesStructuredResult {
  /**
   * Listing roots in request order.
   */
  roots: ListedDirectoryRootOutput[];
}

const ListedDirectoryEntryBaseSchema = FileSystemEntryMetadataSchema.extend({
  name: z.string(),
  path: z.string(),
});

export const ListedDirectoryEntryOutputSchema: z.ZodType<ListedDirectoryEntryOutput> = z.lazy(
  () =>
    ListedDirectoryEntryBaseSchema.extend({
      children: z.array(ListedDirectoryEntryOutputSchema).optional(),
    }),
);

export const ListDirectoryEntriesStructuredResultSchema: z.ZodType<ListDirectoryEntriesStructuredResult> =
  z.object({
    roots: z.array(
      z.object({
        requestedPath: z.string(),
        entries: z.array(ListedDirectoryEntryOutputSchema),
      }),
    ),
  });
