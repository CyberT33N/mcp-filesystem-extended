import { z } from "zod";

import {
  MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST,
  PATH_MAX_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";

export const CreateDirectoriesArgsSchema = z.object({
  /**
   * Directory creation paths.
   *
   * @remarks
   * Use this property to provide the directory paths that should be created in
   * the current guarded mutation request.
   *
   * @example
   * ```ts
   * {
   *   paths: ["logs", "artifacts\\daily"]
   * }
   * ```
   */
  paths: z
    .array(z.string().max(PATH_MAX_CHARS))
    .min(1)
    .max(MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST)
    .describe("Paths of directories to create. Pass one path for a single directory creation or multiple paths for a batch directory creation."),
});
