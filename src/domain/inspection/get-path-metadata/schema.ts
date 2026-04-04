import { z } from "zod";

export const GetPathMetadataArgsSchema = z.object({
  paths: z.array(z.string()).min(1).describe("Array of file or directory paths. Pass one path for a single lookup or multiple paths for batch metadata retrieval."),
});

export const GetPathMetadataResultSchema = z.object({
  entries: z.array(
    z.object({
      path: z.string(),
      type: z.enum(["directory", "file", "other"]),
      size: z.number(),
      created: z.string(),
      modified: z.string(),
      accessed: z.string(),
      permissions: z.string(),
    }),
  ),
  errors: z.array(
    z.object({
      path: z.string(),
      error: z.string(),
    }),
  ),
});
