import { z } from "zod";

export const CountLinesArgsSchema = z.object({
  path: z.string().describe("Path to the file or directory to count lines"),
  recursive: z.boolean().optional().default(false).describe("Whether to recursively count lines in directories"),
  pattern: z.string().optional().describe("Regex pattern to match lines (only count matching lines)"),
  filePattern: z.string().optional().default("**").describe("Glob pattern to match files when counting recursively"),
  excludePatterns: z.array(z.string()).optional().default([]).describe("Glob patterns to exclude"),
  ignoreEmptyLines: z.boolean().optional().default(false).describe("Whether to ignore empty lines"),
});
