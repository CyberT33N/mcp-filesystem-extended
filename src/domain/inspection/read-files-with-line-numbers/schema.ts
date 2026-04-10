import { z } from "zod";
import {
  MAX_GENERIC_PATHS_PER_REQUEST,
  PATH_MAX_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";

export const ReadFilesWithLineNumbersArgsSchema = z.object({
  /**
   * Requested file paths.
   *
   * @remarks
   * Use this property to provide the text files that should be read with line
   * numbers under the schema-level batch ceiling.
   *
   * @example
   * ```ts
   * {
   *   paths: ["README.md", "src/index.ts"]
   * }
   * ```
   */
  paths: z
    .array(z.string().max(PATH_MAX_CHARS))
    .min(1)
    .max(MAX_GENERIC_PATHS_PER_REQUEST)
    .describe(
      "Paths to the text files to read. Pass one path for a single-file read or multiple paths for a batch read."
    ),
});
