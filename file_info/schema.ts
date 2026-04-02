import { z } from "zod";

export const GetFileInfoArgsSchema = z.object({
  paths: z.array(z.string()).min(1).describe("Array of file or directory paths. Pass one path for a single lookup or multiple paths for batch metadata retrieval."),
});
