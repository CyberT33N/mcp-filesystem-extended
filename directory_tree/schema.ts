import { z } from "zod";

export const DirectoryTreeArgsSchema = z.object({
  paths: z.array(z.string()).min(1).describe("Array of root directory paths. Pass one path for a single tree or multiple paths for batch tree generation."),
  excludePatterns: z.array(z.string()).optional().default([]),
});
