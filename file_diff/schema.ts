import { z } from "zod";

export const FileDiffArgsSchema = z.object({
  file1: z.string(),
  file2: z.string(),
});