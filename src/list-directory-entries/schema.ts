import { z } from "zod";

export const ListDirectoryEntriesArgsSchema = z.object({
  paths: z
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
  excludePatterns: z
    .array(z.string())
    .optional()
    .default([])
    .describe(
      "Glob-like patterns for entries that should be excluded from the structured listing output."
    ),
});
