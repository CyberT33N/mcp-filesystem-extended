import { z } from "zod";

export const CreateDirectoriesArgsSchema = z.object({
  paths: z
    .array(z.string())
    .min(1)
    .describe("Paths of directories to create. Pass one path for a single directory creation or multiple paths for a batch directory creation."),
});
