import { z } from "zod";

import {
  MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST,
  PATH_MAX_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";

export const CopyPathsArgsSchema = z.object({
  /**
   * Copy operations.
   *
   * @remarks
   * Use this property to provide the source-to-destination copy requests that
   * should run inside one guarded mutation batch.
   *
   * @example
   * ```ts
   * {
   *   operations: [{ sourcePath: "src.txt", destinationPath: "backup\\src.txt" }]
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
         * This property identifies the file or directory that should be copied.
         *
         * @example
         * ```ts
         * {
         *   sourcePath: "src.txt"
         * }
         * ```
         */
        sourcePath: z.string().max(PATH_MAX_CHARS).describe("Path to the source file or directory"),
        /**
         * Destination path.
         *
         * @remarks
         * This property identifies where the copied file-system item should be
         * materialized.
         *
         * @example
         * ```ts
         * {
         *   destinationPath: "backup\\src.txt"
         * }
         * ```
         */
        destinationPath: z.string().max(PATH_MAX_CHARS).describe("Path to the destination file or directory. Missing parent directories are created recursively by this tool."),
        /**
         * Recursive copy flag.
         *
         * @remarks
         * Enable this property when directory trees should be copied instead of
         * restricting the operation to non-recursive semantics.
         *
         * @example
         * ```ts
         * {
         *   recursive: true
         * }
         * ```
         */
        recursive: z.boolean().default(false).describe("Copy directories recursively. Destination parent directories are still created recursively even when this flag is false."),
        /**
         * Overwrite flag.
         *
         * @remarks
         * Enable this property when an existing destination may be replaced by
         * the copy operation.
         *
         * @example
         * ```ts
         * {
         *   overwrite: true
         * }
         * ```
         */
        overwrite: z.boolean().default(false).describe("Overwrite destination if it exists"),
      })
    )
    .min(1)
    .max(MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST)
    .describe("Copy operations. Pass one operation for a single copy or multiple operations for a batch copy. The tool creates missing destination parent directories recursively, so a separate create_directories call is unnecessary."),
});
