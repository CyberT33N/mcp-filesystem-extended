import { z } from "zod";

export const CreateFilesArgsSchema = z.object({
  files: z
    .array(
      z.object({
        path: z.string().describe("Path to the file to write"),
        content: z.string().describe("Content to write to the file"),
      })
    )
    .min(1)
    .describe("Files to create. Pass one file for a single creation or multiple files for a batch creation."),
});
