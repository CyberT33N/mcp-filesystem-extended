import { z } from "zod";

export const GetFileInfoArgsSchema = z.object({
  path: z.string(),
});