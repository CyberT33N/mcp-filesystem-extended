import { z } from "zod";

import {
  MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST,
  PATH_MAX_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";

export const DeletePathsArgsSchema = z.object({
  /**
   * Deletion targets.
   *
   * @remarks
   * Use this property to provide the files or directories that should be
   * removed in one guarded deletion request.
   *
   * @example
   * ```ts
   * {
   *   paths: ["build", "temp.txt"]
   * }
   * ```
   */
  paths: z
    .array(z.string().max(PATH_MAX_CHARS))
    .min(1)
    .max(MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST)
    .describe("Paths to files or directories to delete. Pass one path for a single delete or multiple paths for a batch delete."),
  /**
   * Recursive deletion mode.
   *
   * @remarks
   * Enable this property when directory inputs may be removed recursively
   * rather than as leaf-only targets.
   *
   * @example
   * ```ts
   * {
   *   recursive: true
   * }
   * ```
   */
  recursive: z.boolean().default(false).describe("Whether to recursively delete directories"),
});
