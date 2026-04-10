import { z } from "zod";
import {
  HASH_STRING_MAX_CHARS,
  MAX_GENERIC_PATHS_PER_REQUEST,
  PATH_MAX_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";

export const VerifyFileChecksumsArgsSchema = z.object({
  /**
   * Files to verify.
   *
   * @remarks
   * Use this property to provide the file paths and expected hash values that
   * should be verified as one request.
   *
   * @example
   * ```ts
   * {
   *   files: [{ path: "package.json", expectedHash: "abc123" }]
   * }
   * ```
   */
  files: z
    .array(
      z.object({
        /**
         * Verification target path.
         *
         * @remarks
         * This property identifies the file whose checksum should be computed
         * and compared to the expected value.
         *
         * @example
         * ```ts
         * {
         *   path: "package.json"
         * }
         * ```
         */
        path: z.string().max(PATH_MAX_CHARS).describe("Path to the file to verify"),
        /**
         * Expected hash value.
         *
         * @remarks
         * This property supplies the checksum string that the computed file hash
         * should equal after normalization.
         *
         * @example
         * ```ts
         * {
         *   expectedHash: "abc123"
         * }
         * ```
         */
        expectedHash: z.string().max(HASH_STRING_MAX_CHARS).describe("Expected hash value to compare against"),
      })
    )
    .min(1)
    .max(MAX_GENERIC_PATHS_PER_REQUEST)
    .describe("Files to verify with their expected hashes. Pass one file for a single verification or multiple files for a batch verification."),
  /**
   * Hash algorithm selection.
   *
   * @remarks
   * This property selects which checksum algorithm should be used before
   * comparing the computed file hash to the expected value.
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

export const VerifyFileChecksumsResultSchema = z.object({
  /**
   * Successful verification entries.
   *
   * @remarks
   * This property contains one entry per file that produced a computed hash and
   * a boolean verification outcome.
   *
   * @example
   * ```ts
   * {
   *   entries: [{ path: "package.json", expectedHash: "abc123", actualHash: "abc123", valid: true }]
   * }
   * ```
   */
  entries: z.array(
    z.object({
      /**
       * Verified file path.
       *
       * @remarks
       * This property identifies the file represented by the verification entry.
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
       * Expected hash echo.
       *
       * @remarks
       * This property repeats the caller-supplied expected hash so verification
       * output stays self-describing.
       *
       * @example
       * ```ts
       * {
       *   expectedHash: "abc123"
       * }
       * ```
       */
      expectedHash: z.string(),
      /**
       * Actual hash value.
       *
       * @remarks
       * This property contains the checksum calculated from the target file
       * under the selected algorithm.
       *
       * @example
       * ```ts
       * {
       *   actualHash: "abc123"
       * }
       * ```
       */
      actualHash: z.string(),
      /**
       * Verification outcome.
       *
       * @remarks
       * This property indicates whether the actual checksum matched the
       * expected hash after normalization.
       *
       * @example
       * ```ts
       * {
       *   valid: true
       * }
       * ```
       */
      valid: z.boolean(),
    }),
  ),
  /**
   * Failed verification entries.
   *
   * @remarks
   * This property contains per-file failures for paths that could not be
   * hashed or validated successfully.
   *
   * @example
   * ```ts
   * {
   *   errors: [{ path: "missing.txt", expectedHash: "abc123", error: "ENOENT" }]
   * }
   * ```
   */
  errors: z.array(
    z.object({
      /**
       * Failed file path.
       *
       * @remarks
       * This property identifies the file whose verification attempt failed.
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
       * Expected hash echo.
       *
       * @remarks
       * This property repeats the expected hash that belonged to the failed
       * verification attempt.
       *
       * @example
       * ```ts
       * {
       *   expectedHash: "abc123"
       * }
       * ```
       */
      expectedHash: z.string(),
      /**
       * Failure message.
       *
       * @remarks
       * This property contains the error text that explains why verification did
       * not complete for the file.
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
  /**
   * Verification summary.
   *
   * @remarks
   * This property aggregates valid, invalid, and failed verification counts so
   * callers can inspect the overall result at a glance.
   *
   * @example
   * ```ts
   * {
   *   summary: { validCount: 1, invalidCount: 0, errorCount: 0 }
   * }
   * ```
   */
  summary: z.object({
    /**
     * Valid file count.
     *
     * @remarks
     * This property reports how many verification entries matched the expected
     * hash successfully.
     *
     * @example
     * ```ts
     * {
     *   validCount: 1
     * }
     * ```
     */
    validCount: z.number(),
    /**
     * Invalid file count.
     *
     * @remarks
     * This property reports how many verification entries completed but did not
     * match the expected hash.
     *
     * @example
     * ```ts
     * {
     *   invalidCount: 0
     * }
     * ```
     */
    invalidCount: z.number(),
    /**
     * Error count.
     *
     * @remarks
     * This property reports how many verification attempts failed before a
     * comparison result could be produced.
     *
     * @example
     * ```ts
     * {
     *   errorCount: 0
     * }
     * ```
     */
    errorCount: z.number(),
  }),
});
