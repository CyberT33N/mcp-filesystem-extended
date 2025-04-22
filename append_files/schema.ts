import { z } from "zod";

export const AppendFilesArgsSchema = z.object({
  files: z.array(
    z.object({
      path: z.string().describe("Path to the file to append to"),
      content: z.string().describe("Content to append to the file"),
    })
  ).describe("Array of files to append to"),
});
