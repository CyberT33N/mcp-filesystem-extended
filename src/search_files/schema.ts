import { z } from "zod";

export const SearchFilesArgsSchema = z.object({
  paths: z.array(z.string()).min(1).describe("Root paths to search in. Pass one path for a single search scope or multiple paths for batch path searches."),
  pattern: z.string(),
  excludePatterns: z.array(z.string()).optional().default([])
});
