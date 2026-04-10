import { z } from "zod";

import {
  MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST,
  PATH_MAX_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";

export const MovePathsArgsSchema = z.object({
  /**
   * Move operations.
   *
   * @remarks
   * Use this property to provide the source-to-destination move requests that
   * should be executed as one guarded mutation batch.
   *
   * @example
   * ```ts
   * {
   *   operations: [{ sourcePath: "draft.txt", destinationPath: "archive\\draft.txt" }]
   * }
   * ```
   */
  operations: z
    .array(
      z.object({
        /**
         * Source path.
         *
         * @remarks
         * This property identifies the file or directory that should be moved.
         *
         * @example
         * ```ts
         * {
         *   sourcePath: "draft.txt"
         * }
         * ```
         */
        sourcePath: z.string().max(PATH_MAX_CHARS).describe("Path to the source file or directory"),
        /**
         * Destination path.
         *
         * @remarks
         * This property identifies the location that should receive the moved
         * file-system item.
         *
         * @example
         * ```ts
         * {
         *   destinationPath: "archive\\draft.txt"
         * }
         * ```
         */
        destinationPath: z.string().max(PATH_MAX_CHARS).describe("Path to the destination file or directory"),
      })
    )
    .min(1)
    .max(MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST)
    .describe("Move operations. Pass one operation for a single move or multiple operations for a batch move."),
  /**
   * Overwrite flag.
   *
   * @remarks
   * Enable this property when an existing destination may be replaced during
   * the move operation.
   *
   * @example
   * ```ts
   * {
   *   overwrite: true
   * }
   * ```
   */
  overwrite: z.boolean().default(false).describe("Whether to overwrite existing files at destination"),
});
