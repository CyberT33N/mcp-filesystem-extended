import { z } from "zod";

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
  includeMetadata: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Whether optional metadata fields from the canonical file_infos metadata surface should be included. The required type field is always returned."
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
interface ListedDirectoryEntryOutput {
  /**
   * Leaf entry name.
   */
  name: string;

  /**
   * Entry path relative to the requested root path.
   */
  path: string;

  /**
   * Required entry category.
   */
  type: "directory" | "file" | "other";

  /**
   * Nested child entries when recursive traversal is enabled.
   */
  children?: ListedDirectoryEntryOutput[] | undefined;

  /**
   * Entry size in bytes when metadata inclusion is enabled.
   */
  size?: number | undefined;

  /**
   * Entry creation timestamp when metadata inclusion is enabled.
   */
  created?: string | undefined;

  /**
   * Entry last-modified timestamp when metadata inclusion is enabled.
   */
  modified?: string | undefined;

  /**
   * Entry last-accessed timestamp when metadata inclusion is enabled.
   */
  accessed?: string | undefined;

  /**
   * Entry permission bits when metadata inclusion is enabled.
   */
  permissions?: string | undefined;
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

export const ListedDirectoryEntryOutputSchema: z.ZodType<ListedDirectoryEntryOutput> = z.lazy(
  () =>
    z.object({
      name: z.string(),
      path: z.string(),
      type: z.enum(["directory", "file", "other"]),
      children: z.array(ListedDirectoryEntryOutputSchema).optional(),
      size: z.number().optional(),
      created: z.string().optional(),
      modified: z.string().optional(),
      accessed: z.string().optional(),
      permissions: z.string().optional(),
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
