import { z } from "zod";

import {
  MAX_CONTENT_FILES_PER_REQUEST,
  MAX_TOTAL_RAW_TEXT_REQUEST_CHARS,
  PATH_MAX_CHARS,
  RAW_CONTENT_MAX_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";

export const AppendFilesArgsSchema = z.object({
  /**
   * Append targets.
   *
   * @remarks
   * Use this property to provide the file append operations that should be
   * executed in one guarded mutation request.
   *
   * @example
   * ```ts
   * {
   *   files: [{ path: "notes.txt", content: "\nmore text" }]
   * }
   * ```
   */
  files: z
    .array(
      z.object({
        /**
         * Append target path.
         *
         * @remarks
         * This property identifies the existing file that should receive the
         * appended content payload.
         *
         * @example
         * ```ts
         * {
         *   path: "notes.txt"
         * }
         * ```
         */
        path: z.string().max(PATH_MAX_CHARS).describe(`Path to the file to append to. Each path is capped at ${PATH_MAX_CHARS} characters.`),
        /**
         * Appended content.
         *
         * @remarks
         * This property contains the raw text that should be appended to the
         * target file after guardrail validation succeeds.
         *
         * @example
         * ```ts
         * {
         *   content: "\nmore text"
         * }
         * ```
         */
        content: z.string().max(RAW_CONTENT_MAX_CHARS).describe(`Content to append to the file. Each content payload is capped at ${RAW_CONTENT_MAX_CHARS} characters.`),
      })
    )
    .min(1)
    .max(MAX_CONTENT_FILES_PER_REQUEST)
    .describe(`Files to append to. Pass one file for a single append or multiple files for a batch append. The request accepts at most ${MAX_CONTENT_FILES_PER_REQUEST} file entries, and the cumulative raw-text input across the request is capped at ${MAX_TOTAL_RAW_TEXT_REQUEST_CHARS} characters.`),
});
