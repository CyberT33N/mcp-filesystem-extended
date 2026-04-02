import { z } from "zod";

export const DeleteFilesArgsSchema = z.object({
  paths: z.array(z.string()).describe("Paths to files or directories to delete"),
  recursive: z.boolean().default(false).describe("Whether to recursively delete directories"),
});
