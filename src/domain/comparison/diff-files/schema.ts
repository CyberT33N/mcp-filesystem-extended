import { z } from "zod";

export const FileDiffArgsSchema = z.object({
  pairs: z
    .array(
      z.object({
        leftPath: z.string().describe("Path to the first file in the diff pair"),
        rightPath: z.string().describe("Path to the second file in the diff pair"),
      })
    )
    .min(1)
    .describe("File pairs to diff. Pass one pair for a single diff or multiple pairs for batch diff generation."),
});
