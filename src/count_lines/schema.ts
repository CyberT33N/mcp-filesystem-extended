import { z } from "zod";

export const CountLinesArgsSchema = z.object({
  paths: z.array(z.string()).min(1).describe("Paths to files or directories to count. Pass one path for a single count scope or multiple paths for batch line counting."),
  recursive: z.boolean().optional().default(false).describe("Whether to recursively count lines in directories"),
  pattern: z.string().optional().describe("Regex pattern to match lines (only count matching lines)"),
  filePattern: z.string().optional().default("**").describe("Glob pattern to match files when counting recursively"),
  excludePatterns: z.array(z.string()).optional().default([]).describe("Glob patterns to exclude"),
  ignoreEmptyLines: z.boolean().optional().default(false).describe("Whether to ignore empty lines"),
});
