import {
  MAX_CONTENT_FILES_PER_REQUEST,
  MAX_REPLACEMENTS_PER_FILE,
  PATH_MAX_CHARS,
  REPLACEMENT_TEXT_MAX_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import { z } from "zod";

export const ReplaceFileLineRangesArgsSchema = z.object({
  /**
   * File replacement batches.
   *
   * @remarks
   * Use this property to provide the files whose inclusive line ranges should
   * be replaced within one guarded content-bearing mutation request.
   *
   * @example
   * ```ts
   * {
   *   files: [{ path: "notes.txt", replacements: [{ startLine: 1, endLine: 2, replacementText: "updated" }] }]
   * }
   * ```
   */
  files: z
    .array(
      z.object({
        /**
         * Replacement target path.
         *
         * @remarks
         * This property identifies the existing text file whose inclusive line
         * ranges should be replaced.
         *
         * @example
         * ```ts
         * {
         *   path: "notes.txt"
         * }
         * ```
         */
        path: z
          .string()
          .max(PATH_MAX_CHARS)
          .describe("Path to the existing text file whose inclusive line ranges should be replaced."),
        /**
         * Replacement operations.
         *
         * @remarks
         * This property contains the ordered line-range replacements that should
         * be applied to the target file.
         *
         * @example
         * ```ts
         * {
         *   replacements: [{ startLine: 1, endLine: 2, replacementText: "updated" }]
         * }
         * ```
         */
        replacements: z
          .array(
            z.object({
              /**
               * Start line number.
               *
               * @remarks
               * This property defines the 1-based first line that belongs to the
               * inclusive replacement range.
               *
               * @example
               * ```ts
               * {
               *   startLine: 1
               * }
               * ```
               */
              startLine: z
                .number()
                .int()
                .min(1)
                .describe("1-based line number where the replacement range starts."),
              /**
               * End line number.
               *
               * @remarks
               * This property defines the 1-based last line that belongs to the
               * inclusive replacement range.
               *
               * @example
               * ```ts
               * {
               *   endLine: 2
               * }
               * ```
               */
              endLine: z
                .number()
                .int()
                .min(1)
                .describe("1-based line number where the replacement range ends."),
              /**
               * Replacement text payload.
               *
               * @remarks
               * This property contains the canonical `replacementText` payload
               * that will be inserted for the inclusive line range.
               *
               * @example
               * ```ts
               * {
               *   replacementText: "updated"
               * }
               * ```
               */
              replacementText: z
                .string()
                .max(REPLACEMENT_TEXT_MAX_CHARS)
                .describe(
                  "Text inserted for the inclusive line range. This field is direct replacement text, not unified diff patch content."
                ),
            })
          )
          .min(1)
          .max(MAX_REPLACEMENTS_PER_FILE)
          .describe("Line-range replacements to apply to this file."),
      })
    )
    .min(1)
    .max(MAX_CONTENT_FILES_PER_REQUEST)
    .describe("Files whose inclusive line ranges should be replaced."),
  /**
   * Dry-run mode.
   *
   * @remarks
   * Enable this property when the replacement result should be previewed
   * without writing the target files.
   *
   * @example
   * ```ts
   * {
   *   dryRun: true
   * }
   * ```
   */
  dryRun: z
    .boolean()
    .default(false)
    .describe("Preview the line-range replacement result without writing files."),
});
