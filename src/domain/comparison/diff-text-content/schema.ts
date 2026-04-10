import {
  LABEL_MAX_CHARS,
  MAX_RAW_TEXT_DIFF_PAIRS_PER_REQUEST,
  RAW_CONTENT_MAX_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import { z } from "zod";

export const DiffTextContentArgsSchema = z.object({
  /**
   * Raw-text diff pairs.
   *
   * @remarks
   * Use this property to provide in-memory text pairs that should be diffed
   * without first reading from disk.
   *
   * @example
   * ```ts
   * {
   *   pairs: [{ leftContent: "old", rightContent: "new" }]
   * }
   * ```
   */
  pairs: z
    .array(
      z.object({
        /**
         * Left-hand content.
         *
         * @remarks
         * This property contains the original in-memory text that forms the
         * left side of the diff comparison.
         *
         * @example
         * ```ts
         * {
         *   leftContent: "old value"
         * }
         * ```
         */
        leftContent: z.string().max(RAW_CONTENT_MAX_CHARS).describe("First content string to compare"),
        /**
         * Right-hand content.
         *
         * @remarks
         * This property contains the modified in-memory text that forms the
         * right side of the diff comparison.
         *
         * @example
         * ```ts
         * {
         *   rightContent: "new value"
         * }
         * ```
         */
        rightContent: z.string().max(RAW_CONTENT_MAX_CHARS).describe("Second content string to compare"),
        /**
         * Left-hand label.
         *
         * @remarks
         * Use this optional property to customize how the left content is named
         * in the generated diff output.
         *
         * @example
         * ```ts
         * {
         *   leftLabel: "original"
         * }
         * ```
         */
        leftLabel: z.string().max(LABEL_MAX_CHARS).optional().default("original").describe("Label for the first content"),
        /**
         * Right-hand label.
         *
         * @remarks
         * Use this optional property to customize how the right content is named
         * in the generated diff output.
         *
         * @example
         * ```ts
         * {
         *   rightLabel: "modified"
         * }
         * ```
         */
        rightLabel: z.string().max(LABEL_MAX_CHARS).optional().default("modified").describe("Label for the second content"),
      })
    )
    .min(1)
    .max(MAX_RAW_TEXT_DIFF_PAIRS_PER_REQUEST)
    .describe("Text-content pairs to diff. Pass one pair for a single diff or multiple pairs for batch diff generation."),
});
