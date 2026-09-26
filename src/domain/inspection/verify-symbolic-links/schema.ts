import { z } from "zod";

import {
  BatchOperationErrorBaseSchema,
} from "@domain/inspection/shared/filesystem-entry-metadata-contract";
import {
  MAX_GENERIC_PATHS_PER_REQUEST,
  PATH_MAX_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";

/**
 * One symbolic-link verification entry of a batch request.
 */
export const SymbolicLinkVerificationRequestSchema = z.object({
  /**
   * Link path to verify.
   *
   * @remarks
   * This property identifies the symbolic link whose stored target and
   * resolvability should be inspected.
   *
   * @example
   * ```ts
   * {
   *   path: "consumers/shortcut.md"
   * }
   * ```
   */
  path: z.string().max(PATH_MAX_CHARS).describe(`Path of the symbolic link to verify. Each path is capped at ${PATH_MAX_CHARS} characters.`),
  /**
   * Expected stored target text.
   *
   * @remarks
   * When provided, verification compares the link's stored target text against
   * this value using trimmed equality after platform separator normalization,
   * because Windows stores targets with normalized backslash separators even
   * when the link was created with forward slashes. When omitted, only link
   * existence and target resolvability are verified.
   *
   * @example
   * ```ts
   * {
   *   expectedTarget: "../canonical/shared.md"
   * }
   * ```
   */
  expectedTarget: z.string().max(PATH_MAX_CHARS).optional().describe(`Expected stored target text to compare against with trimmed equality after platform separator normalization. When omitted, only link existence and target resolvability are verified. Each expected target is capped at ${PATH_MAX_CHARS} characters.`),
});

/**
 * Inferred TypeScript type for one symbolic-link verification request entry.
 */
export type VerifySymbolicLinkRequestEntry = z.infer<typeof SymbolicLinkVerificationRequestSchema>;

/**
 * Public request schema for the `verify_symbolic_links` endpoint.
 */
export const VerifySymbolicLinksArgsSchema = z.object({
  /**
   * Symbolic link verification entries.
   *
   * @remarks
   * Use this property to provide the link paths and optional expected targets
   * that should be verified as one request.
   *
   * @example
   * ```ts
   * {
   *   links: [{ path: "consumers/shortcut.md", expectedTarget: "../canonical/shared.md" }]
   * }
   * ```
   */
  links: z
    .array(SymbolicLinkVerificationRequestSchema)
    .min(1)
    .max(MAX_GENERIC_PATHS_PER_REQUEST)
    .describe(`Symbolic links to verify. Pass one link for a single verification or multiple links for a batch verification. The request accepts at most ${MAX_GENERIC_PATHS_PER_REQUEST} link entries.`),
});

/**
 * Inferred TypeScript type for the `verify_symbolic_links` request.
 */
export type VerifySymbolicLinksArgs = z.infer<typeof VerifySymbolicLinksArgsSchema>;

/**
 * Public structured result schema for the `verify_symbolic_links` endpoint.
 */
export const VerifySymbolicLinksResultSchema = z.object({
  /**
   * Successful verification entries.
   *
   * @remarks
   * This property contains one entry per link that produced a verification
   * judgment, including negative judgments such as dangling links or
   * non-link paths.
   *
   * @example
   * ```ts
   * {
   *   entries: [{ path: "consumers/shortcut.md", expectedTarget: "../canonical/shared.md", actualTarget: "../canonical/shared.md", resolvable: true, valid: true }]
   * }
   * ```
   */
  entries: z.array(
    z.object({
      /**
       * Verified link path.
       *
       * @remarks
       * This property echoes the caller-requested link path exactly.
       *
       * @example
       * ```ts
       * {
       *   path: "consumers/shortcut.md"
       * }
       * ```
       */
      path: z.string(),
      /**
       * Expected target echo.
       *
       * @remarks
       * This property repeats the caller-supplied expected target so
       * verification output stays self-describing.
       *
       * @example
       * ```ts
       * {
       *   expectedTarget: "../canonical/shared.md"
       * }
       * ```
       */
      expectedTarget: z.string().optional(),
      /**
       * Stored target text.
       *
       * @remarks
       * This property contains the verbatim target text stored in the link.
       * It is `null` when the verified path is not a symbolic link at all.
       *
       * @example
       * ```ts
       * {
       *   actualTarget: "../canonical/shared.md"
       * }
       * ```
       */
      actualTarget: z.string().nullable(),
      /**
       * Target resolvability.
       *
       * @remarks
       * This property indicates whether the link's target currently resolves
       * to an existing filesystem entry. A dangling link is not resolvable.
       *
       * @example
       * ```ts
       * {
       *   resolvable: true
       * }
       * ```
       */
      resolvable: z.boolean(),
      /**
       * Verification outcome.
       *
       * @remarks
       * This property indicates whether the path is a symbolic link whose
       * target resolves and, when an expected target was supplied, whose
       * stored target text matched.
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
   * This property contains per-link failures for paths that could not be
   * inspected successfully, for example missing paths or scope violations.
   *
   * @example
   * ```ts
   * {
   *   errors: [{ path: "missing.md", error: "ENOENT" }]
   * }
   * ```
   */
  errors: z.array(
    BatchOperationErrorBaseSchema.extend({
      /**
       * Expected target echo.
       *
       * @remarks
       * This property repeats the expected target that belonged to the failed
       * verification attempt when one was supplied.
       *
       * @example
       * ```ts
       * {
       *   expectedTarget: "../canonical/shared.md"
       * }
       * ```
       */
      expectedTarget: z.string().optional(),
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
     * Valid link count.
     *
     * @remarks
     * This property reports how many links verified successfully.
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
     * Invalid link count.
     *
     * @remarks
     * This property reports how many links produced a verification judgment
     * with a negative outcome, including dangling links, target mismatches,
     * and non-link paths.
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
     * verification judgment could be produced.
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

/**
 * Inferred TypeScript type for the `verify_symbolic_links` structured result.
 */
export type VerifySymbolicLinksResult = z.infer<typeof VerifySymbolicLinksResultSchema>;
