import { z } from "zod";
import {
  DefaultedFileSystemEntryMetadataSelectionSchema,
  FileSystemEntryMetadataSchema,
} from "@domain/inspection/shared/filesystem-entry-metadata-contract";

/**
 * Input schema for the `get_path_metadata` tool.
 */
export const GetPathMetadataArgsSchema = z.object({
  paths: z
    .array(z.string())
    .min(1)
    .describe(
      "Array of file or directory paths. Pass one path for a single lookup or multiple paths for batch metadata retrieval."
    ),
  metadata: DefaultedFileSystemEntryMetadataSelectionSchema.describe(
    "Optional grouped metadata selectors. `size` and `type` are always returned. Set `timestamps` and/or `permissions` to true to include those groups."
  ),
});

/**
 * Structured result schema for the `get_path_metadata` tool.
 */
export const GetPathMetadataResultSchema = z.object({
  entries: z.array(
    FileSystemEntryMetadataSchema.extend({
      path: z.string(),
    })
  ),
  errors: z.array(
    z.object({
      path: z.string(),
      error: z.string(),
    }),
  ),
});
