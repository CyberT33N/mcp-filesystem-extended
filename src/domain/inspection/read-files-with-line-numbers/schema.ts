import { z } from "zod";

export const ReadFilesArgsSchema = z.object({
  paths: z
    .array(z.string())
    .min(1)
    .describe(
      "Paths to the text files to read. Pass one path for a single-file read or multiple paths for a batch read."
    ),
});
