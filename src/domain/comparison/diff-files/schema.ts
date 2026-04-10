import {
  MAX_COMPARISON_PAIRS_PER_REQUEST,
  PATH_MAX_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import { z } from "zod";

export const DiffFilesArgsSchema = z.object({
  /**
   * File diff pairs.
   *
   * @remarks
   * Use this property to provide the left-versus-right file path pairs that
   * should be compared within the guarded batch size.
   *
   * @example
   * ```ts
   * {
   *   pairs: [{ leftPath: "before.txt", rightPath: "after.txt" }]
   * }
   * ```
   */
  pairs: z
    .array(
      z.object({
        /**
         * Left-hand file path.
         *
         * @remarks
         * This property identifies the baseline file for the current diff pair.
         *
         * @example
         * ```ts
         * {
         *   leftPath: "before.txt"
         * }
         * ```
         */
        leftPath: z.string().max(PATH_MAX_CHARS).describe("Path to the first file in the diff pair"),
        /**
         * Right-hand file path.
         *
         * @remarks
         * This property identifies the comparison file whose content is diffed
         * against the left-hand path.
         *
         * @example
         * ```ts
         * {
         *   rightPath: "after.txt"
         * }
         * ```
         */
        rightPath: z.string().max(PATH_MAX_CHARS).describe("Path to the second file in the diff pair"),
      })
    )
    .min(1)
    .max(MAX_COMPARISON_PAIRS_PER_REQUEST)
    .describe("File pairs to diff. Pass one pair for a single diff or multiple pairs for batch diff generation."),
});
