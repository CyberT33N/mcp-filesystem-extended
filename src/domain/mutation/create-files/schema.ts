import { z } from "zod";

import {
  MAX_CONTENT_FILES_PER_REQUEST,
  PATH_MAX_CHARS,
  RAW_CONTENT_MAX_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";

export const CreateFilesArgsSchema = z.object({
  /**
   * File creation entries.
   *
   * @remarks
   * Use this property to provide the file paths and contents that should be
   * created inside one guarded content-bearing mutation request.
   *
   * @example
   * ```ts
   * {
   *   files: [{ path: "notes.txt", content: "hello" }]
   * }
   * ```
   */
  files: z
    .array(
      z.object({
        /**
         * Output file path.
         *
         * @remarks
         * This property identifies the file that should be written by the
         * creation operation.
         *
         * @example
         * ```ts
         * {
         *   path: "notes.txt"
         * }
         * ```
         */
        path: z.string().max(PATH_MAX_CHARS).describe("Path to the file to write"),
        /**
         * File content payload.
         *
         * @remarks
         * This property contains the raw text that should be written into the
         * created file after guardrail validation succeeds.
         *
         * @example
         * ```ts
         * {
         *   content: "hello"
         * }
         * ```
         */
        content: z.string().max(RAW_CONTENT_MAX_CHARS).describe("Content to write to the file"),
      })
    )
    .min(1)
    .max(MAX_CONTENT_FILES_PER_REQUEST)
    .describe("Files to create. Pass one file for a single creation or multiple files for a batch creation."),
});
