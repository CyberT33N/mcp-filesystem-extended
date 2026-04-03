import { z } from "zod";

export const SearchRegexArgsSchema = z.object({
  roots: z
    .array(z.string())
    .min(1)
    .describe(
      "Root directories to search in. Pass one path for a single regex search scope or multiple paths for batch regex searches."
    ),
  regex: z
    .string()
    .describe(
      "Regular expression applied to file contents. This field uses regex syntax, not glob syntax and not plain substring matching."
    ),
  includeGlobs: z
    .array(z.string())
    .optional()
    .default([])
    .describe(
      "Glob patterns used to limit which files are searched before the regex is applied to file contents."
    ),
  excludeGlobs: z
    .array(z.string())
    .optional()
    .default([])
    .describe("Glob patterns that should be excluded from the regex search scope."),
  maxResults: z.number().optional().default(100).describe("Maximum number of results to return"),
  caseSensitive: z.boolean().optional().default(false).describe("Whether the search should be case-sensitive"),
});
