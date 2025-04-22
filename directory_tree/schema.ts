import { z } from "zod";

export const DirectoryTreeArgsSchema = z.object({
  path: z.string(),
  excludePatterns: z.array(z.string()).optional().default([]),
});