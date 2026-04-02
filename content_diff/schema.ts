import { z } from "zod";

export const ContentDiffArgsSchema = z.object({
  items: z.array(
    z.object({
      content1: z.string().describe("First content string to compare"),
      content2: z.string().describe("Second content string to compare"),
      label1: z.string().optional().default("original").describe("Label for the first content"),
      label2: z.string().optional().default("modified").describe("Label for the second content"),
    })
  ).min(1).describe("Array of content-diff pairs. Pass one pair for a single diff or multiple pairs for batch diff generation."),
});
