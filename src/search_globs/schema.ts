import { z } from "zod";

export const SearchGlobArgsSchema = z.object({
  paths: z.array(z.string()).min(1).describe("Root directories to search in. Pass one path for a single glob search scope or multiple paths for batch glob searches."),
  pattern: z.string().describe("Glob pattern to match files against (e.g. '**/*.js')"),
  excludePatterns: z.array(z.string()).optional().default([]).describe("Glob patterns to exclude"),
  maxResults: z.number().optional().default(500).describe("Maximum number of results to return"),
});
