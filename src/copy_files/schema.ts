import { z } from "zod";

export const CopyFileArgsSchema = z.object({
  items: z.array(
    z.object({
      source: z.string().describe("Path to the source file or directory"),
      destination: z.string().describe("Path to the destination file or directory"),
      recursive: z.boolean().default(false).describe("Copy directories recursively"),
      overwrite: z.boolean().default(false).describe("Overwrite destination if it exists"),
    })
  ).min(1).describe("Array of copy operations. Pass one item for a single copy or multiple items for batch copying."),
});
