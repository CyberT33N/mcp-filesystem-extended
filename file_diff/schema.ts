import { z } from "zod";

export const FileDiffArgsSchema = z.object({
  items: z.array(
    z.object({
      file1: z.string().describe("Path to the first file"),
      file2: z.string().describe("Path to the second file"),
    })
  ).min(1).describe("Array of file-diff pairs. Pass one pair for a single diff or multiple pairs for batch diff generation."),
});
