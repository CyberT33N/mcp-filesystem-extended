import { z } from "zod";

export const CreateDirectoriesArgsSchema = z.object({
  paths: z.array(z.string()).describe("Paths of directories to create"),
});
