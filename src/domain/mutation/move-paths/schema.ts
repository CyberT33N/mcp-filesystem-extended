import { z } from "zod";

export const MovePathsArgsSchema = z.object({
  operations: z
    .array(
      z.object({
        sourcePath: z.string().describe("Path to the source file or directory"),
        destinationPath: z.string().describe("Path to the destination file or directory"),
      })
    )
    .min(1)
    .describe("Move operations. Pass one operation for a single move or multiple operations for a batch move."),
  overwrite: z.boolean().default(false).describe("Whether to overwrite existing files at destination"),
});
