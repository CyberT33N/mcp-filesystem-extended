import { z } from "zod";

export const AppendFilesArgsSchema = z.object({
  files: z
    .array(
      z.object({
        path: z.string().describe("Path to the file to append to"),
        content: z.string().describe("Content to append to the file"),
      })
    )
    .min(1)
    .describe("Files to append to. Pass one file for a single append or multiple files for a batch append."),
});
