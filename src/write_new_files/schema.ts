import { z } from "zod";

export const WriteNewFilesArgsSchema = z.object({
  files: z.array(
    z.object({
      path: z.string().describe("Path to the file to write"),
      content: z.string().describe("Content to write to the file"),
    })
  ).describe("Array of files to write"),
});