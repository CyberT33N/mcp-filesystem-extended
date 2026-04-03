import { z } from "zod";

export const ContentDiffArgsSchema = z.object({
  pairs: z
    .array(
      z.object({
        leftContent: z.string().describe("First content string to compare"),
        rightContent: z.string().describe("Second content string to compare"),
        leftLabel: z.string().optional().default("original").describe("Label for the first content"),
        rightLabel: z.string().optional().default("modified").describe("Label for the second content"),
      })
    )
    .min(1)
    .describe("Text-content pairs to diff. Pass one pair for a single diff or multiple pairs for batch diff generation."),
});
