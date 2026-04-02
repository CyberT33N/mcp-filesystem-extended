import { z } from "zod";

export const ReadFilesArgsSchema = z.object({
  paths: z.array(z.string()),
});