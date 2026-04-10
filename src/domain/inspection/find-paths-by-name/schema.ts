import { z } from "zod";
import {
  GLOB_PATTERN_MAX_CHARS,
  LABEL_MAX_CHARS,
  MAX_DISCOVERY_ROOTS_PER_REQUEST,
  MAX_EXCLUDE_GLOBS_PER_REQUEST,
  PATH_MAX_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";

export const FindPathsByNameArgsSchema = z.object({
  /**
   * Search roots.
   *
   * @remarks
   * Use this property to define the root directories whose entry names should
   * be scanned for the requested substring.
   *
   * @example
   * ```ts
   * {
   *   roots: ["src", ".plan"]
   * }
   * ```
   */
  roots: z
    .array(z.string().max(PATH_MAX_CHARS))
    .min(1)
    .max(MAX_DISCOVERY_ROOTS_PER_REQUEST)
    .describe(
      "Root paths to search in. Pass one path for a single search scope or multiple paths for batch path searches."
    ),
  /**
   * Name substring filter.
   *
   * @remarks
   * This property performs a plain-text, case-insensitive substring match over
   * file and directory names rather than over file contents.
   *
   * @example
   * ```ts
   * {
   *   nameContains: "schema"
   * }
   * ```
   */
  nameContains: z
    .string()
    .max(LABEL_MAX_CHARS)
    .describe(
      "Case-insensitive substring matched against file and directory names. This field is plain text, not regex syntax."
    ),
  /**
   * Exclusion globs.
   *
   * @remarks
   * Use this property to skip directories or files whose relative paths should
   * be excluded from the name-based traversal.
   *
   * @example
   * ```ts
   * {
   *   excludeGlobs: ["**\/node_modules/**"]
   * }
   * ```
   */
  excludeGlobs: z
    .array(z.string().max(GLOB_PATTERN_MAX_CHARS))
    .max(MAX_EXCLUDE_GLOBS_PER_REQUEST)
    .optional()
    .default([])
    .describe("Glob patterns that should be excluded from the path search."),
  /**
   * Result ceiling.
   *
   * @remarks
   * This property limits how many matching paths can be returned before the
   * search marks the result as truncated.
   *
   * @example
   * ```ts
   * {
   *   maxResults: 25
   * }
   * ```
   */
  maxResults: z.number().max(500).optional().default(500).describe("Maximum number of results to return"),
});

export const FindPathsByNameResultSchema = z.object({
  /**
   * Per-root search results.
   *
   * @remarks
   * This property preserves one structured result per requested root so name
   * search output remains attributable.
   *
   * @example
   * ```ts
   * {
   *   roots: [{ root: "src", matches: ["src/schema.ts"], truncated: false }]
   * }
   * ```
   */
  roots: z.array(
    z.object({
      /**
       * Root echo.
       *
       * @remarks
       * This property repeats the requested root that produced the nested
       * match collection.
       *
       * @example
       * ```ts
       * {
       *   root: "src"
       * }
       * ```
       */
      root: z.string(),
      /**
       * Matching paths.
       *
       * @remarks
       * This property lists the concrete file-system paths whose names include
       * the requested substring.
       *
       * @example
       * ```ts
       * {
       *   matches: ["src/domain/inspection/read-files-with-line-numbers/schema.ts"]
       * }
       * ```
       */
      matches: z.array(z.string()),
      /**
       * Root truncation flag.
       *
       * @remarks
       * This property indicates whether result collection for the current root
       * stopped because the maximum result cap was reached.
       *
       * @example
       * ```ts
       * {
       *   truncated: false
       * }
       * ```
       */
      truncated: z.boolean(),
    }),
  ),
  /**
   * Aggregate match count.
   *
   * @remarks
   * This property reports the total number of matched paths across all roots.
   *
   * @example
   * ```ts
   * {
   *   totalMatches: 4
   * }
   * ```
   */
  totalMatches: z.number(),
  /**
   * Aggregate truncation flag.
   *
   * @remarks
   * This property becomes true when any root-level search result reached the
   * effective result ceiling.
   *
   * @example
   * ```ts
   * {
   *   truncated: false
   * }
   * ```
   */
  truncated: z.boolean(),
});
