import { z } from "zod";

export const MoveFilesArgsSchema = z.object({
  items: z.array(
    z.object({
      source: z.string().describe("Path to the source file or directory"),
      destination: z.string().describe("Path to the destination file or directory"),
    })
  ).describe("Array of source-destination pairs"),
  overwrite: z.boolean().default(false).describe("Whether to overwrite existing files at destination"),
});
