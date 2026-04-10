import { z } from "zod";
import {
  MAX_GENERIC_PATHS_PER_REQUEST,
  PATH_MAX_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";

export const GetFileChecksumsArgsSchema = z.object({
  /**
   * Target file paths.
   *
   * @remarks
   * Use this property to identify the files whose checksums should be computed
   * within the request batch ceiling.
   *
   * @example
   * ```ts
   * {
   *   paths: ["package.json", "tsconfig.json"]
   * }
   * ```
   */
  paths: z
    .array(z.string().max(PATH_MAX_CHARS))
    .min(1)
    .max(MAX_GENERIC_PATHS_PER_REQUEST)
    .describe("Paths to the files to generate checksums for. Pass one path for a single checksum calculation or multiple paths for a batch checksum calculation."),
  /**
   * Hash algorithm selection.
   *
   * @remarks
   * This property selects the checksum algorithm used to compute deterministic
   * hash output for each validated file.
   *
   * @example
   * ```ts
   * {
   *   algorithm: "sha256"
   * }
   * ```
   */
  algorithm: z.enum(["md5", "sha1", "sha256", "sha512"]).default("sha256").describe("Hash algorithm to use"),
});

export const GetFileChecksumsResultSchema = z.object({
  /**
   * Successful checksum entries.
   *
   * @remarks
   * This property contains one entry for each file whose checksum could be
   * computed successfully.
   *
   * @example
   * ```ts
   * {
   *   entries: [{ path: "package.json", hash: "abc123" }]
   * }
   * ```
   */
  entries: z.array(
    z.object({
      /**
       * File path echo.
       *
       * @remarks
       * This property identifies the file associated with the checksum entry.
       *
       * @example
       * ```ts
       * {
       *   path: "package.json"
       * }
       * ```
       */
      path: z.string(),
      /**
       * Computed hash value.
       *
       * @remarks
       * This property contains the checksum string produced for the file under
       * the selected algorithm.
       *
       * @example
       * ```ts
       * {
       *   hash: "abc123"
       * }
       * ```
       */
      hash: z.string(),
    }),
  ),
  /**
   * Failed checksum entries.
   *
   * @remarks
   * This property contains one entry per file that could not be processed so
   * callers can inspect partial failures without losing successful hashes.
   *
   * @example
   * ```ts
   * {
   *   errors: [{ path: "missing.txt", error: "ENOENT" }]
   * }
   * ```
   */
  errors: z.array(
    z.object({
      /**
       * Failed file path.
       *
       * @remarks
       * This property identifies the file whose checksum operation failed.
       *
       * @example
       * ```ts
       * {
       *   path: "missing.txt"
       * }
       * ```
       */
      path: z.string(),
      /**
       * Failure message.
       *
       * @remarks
       * This property carries the error message that explains why checksum
       * generation did not succeed for the file.
       *
       * @example
       * ```ts
       * {
       *   error: "ENOENT: no such file or directory"
       * }
       * ```
       */
      error: z.string(),
    }),
  ),
});
