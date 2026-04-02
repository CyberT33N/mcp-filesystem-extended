import { z } from "zod";

export const ListDirectoryArgsSchema = z.object({
  paths: z.array(z.string()).min(1).describe("Array of directory paths. Pass one path for a single listing or multiple paths for batch directory listings."),
});
