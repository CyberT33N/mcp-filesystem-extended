import { z } from "zod";

export const FindPathsByNameArgsSchema = z.object({
  roots: z
    .array(z.string())
    .min(1)
    .describe(
      "Root paths to search in. Pass one path for a single search scope or multiple paths for batch path searches."
    ),
  nameContains: z
    .string()
    .describe(
      "Case-insensitive substring matched against file and directory names. This field is plain text, not regex syntax."
    ),
  excludeGlobs: z
    .array(z.string())
    .optional()
    .default([])
    .describe("Glob patterns that should be excluded from the path search."),
});

export const FindPathsByNameResultSchema = z.object({
  roots: z.array(
    z.object({
      root: z.string(),
      matches: z.array(z.string()),
    }),
  ),
  totalMatches: z.number(),
});
