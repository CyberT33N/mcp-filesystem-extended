import { z } from "zod";

export const SearchGlobArgsSchema = z.object({
  path: z.string().describe("Root directory to search in"),
  pattern: z.string().describe("Glob pattern to match files against (e.g. '**/*.js')"),
  excludePatterns: z.array(z.string()).optional().default([]).describe("Glob patterns to exclude"),
  maxResults: z.number().optional().default(500).describe("Maximum number of results to return"),
});
