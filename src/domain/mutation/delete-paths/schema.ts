import { z } from "zod";

export const DeleteFilesArgsSchema = z.object({
  paths: z
    .array(z.string())
    .min(1)
    .describe("Paths to files or directories to delete. Pass one path for a single delete or multiple paths for a batch delete."),
  recursive: z.boolean().default(false).describe("Whether to recursively delete directories"),
});
