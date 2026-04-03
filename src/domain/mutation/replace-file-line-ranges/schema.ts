import { z } from "zod";

export const PatchFilesArgsSchema = z.object({
  files: z
    .array(
      z.object({
        path: z
          .string()
          .describe("Path to the existing text file whose inclusive line ranges should be replaced."),
        replacements: z
          .array(
            z.object({
              startLine: z
                .number()
                .int()
                .min(1)
                .describe("1-based line number where the replacement range starts."),
              endLine: z
                .number()
                .int()
                .min(1)
                .describe("1-based line number where the replacement range ends."),
              replacementText: z
                .string()
                .describe(
                  "Text inserted for the inclusive line range. This field is direct replacement text, not unified diff patch content."
                ),
            })
          )
          .min(1)
          .describe("Line-range replacements to apply to this file."),
      })
    )
    .min(1)
    .describe("Files whose inclusive line ranges should be replaced."),
  dryRun: z
    .boolean()
    .default(false)
    .describe("Preview the line-range replacement result without writing files."),
});
