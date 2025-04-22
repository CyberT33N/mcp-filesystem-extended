import { z } from "zod";

export const ListDirectoryArgsSchema = z.object({
  path: z.string(),
});