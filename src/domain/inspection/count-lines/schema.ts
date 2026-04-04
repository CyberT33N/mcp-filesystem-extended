import { z } from "zod";

export const CountLinesArgsSchema = z.object({
  paths: z.array(z.string()).min(1).describe("Paths to files or directories to count. Pass one path for a single count scope or multiple paths for batch line counting."),
  recursive: z.boolean().optional().default(false).describe("Whether to recursively count lines in directories"),
  regex: z.string().optional().describe("Regular expression applied to counted lines. This field uses regex syntax, not glob syntax and not plain substring matching."),
  includeGlobs: z.array(z.string()).optional().default(["**"]).describe("Glob patterns used to limit which files are included when counting recursively."),
  excludeGlobs: z.array(z.string()).optional().default([]).describe("Glob patterns that should be excluded from the counting scope."),
  ignoreEmptyLines: z.boolean().optional().default(false).describe("Whether to ignore empty lines"),
});

export const CountLinesResultSchema = z.object({
  paths: z.array(
    z.object({
      path: z.string(),
      files: z.array(
        z.object({
          file: z.string(),
          count: z.number(),
          matchingCount: z.number().optional(),
        }),
      ),
      totalLines: z.number(),
      totalMatchingLines: z.number(),
    }),
  ),
  totalFiles: z.number(),
  totalLines: z.number(),
  totalMatchingLines: z.number(),
});
