import { z } from "zod";

export const SearchRegexArgsSchema = z.object({
  paths: z.array(z.string()).min(1).describe("Root directories to search in. Pass one path for a single regex search scope or multiple paths for batch regex searches."),
  pattern: z.string().describe("Regular expression pattern to search for in file contents"),
  filePatterns: z.array(z.string()).optional().default([]).describe("File patterns to include (e.g. '*.js', '*.ts')"),
  excludePatterns: z.array(z.string()).optional().default([]).describe("Patterns to exclude from search"),
  maxResults: z.number().optional().default(100).describe("Maximum number of results to return"),
  caseSensitive: z.boolean().optional().default(false).describe("Whether the search should be case-sensitive"),
});
