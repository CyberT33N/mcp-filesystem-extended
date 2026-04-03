import { z } from "zod";

export const SearchGlobArgsSchema = z.object({
  roots: z
    .array(z.string())
    .min(1)
    .describe(
      "Root directories to search in. Pass one path for a single glob search scope or multiple paths for batch glob searches."
    ),
  glob: z
    .string()
    .describe(
      "Glob pattern used for path matching, for example '**/*.ts'. This field is evaluated against paths, not file contents."
    ),
  excludeGlobs: z
    .array(z.string())
    .optional()
    .default([])
    .describe("Glob patterns that should be excluded from the file search scope."),
  maxResults: z.number().optional().default(500).describe("Maximum number of results to return"),
});
