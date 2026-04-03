import { z } from "zod";

export const CopyFileArgsSchema = z.object({
  operations: z
    .array(
      z.object({
        sourcePath: z.string().describe("Path to the source file or directory"),
        destinationPath: z.string().describe("Path to the destination file or directory"),
        recursive: z.boolean().default(false).describe("Copy directories recursively"),
        overwrite: z.boolean().default(false).describe("Overwrite destination if it exists"),
      })
    )
    .min(1)
    .describe("Copy operations. Pass one operation for a single copy or multiple operations for a batch copy."),
});
