import { z } from "zod";

export const CopyFileArgsSchema = z.object({
  source: z.string(),
  destination: z.string(),
  recursive: z.boolean().default(false).describe('Copy directories recursively'),
  overwrite: z.boolean().default(false).describe('Overwrite destination if it exists'),
});