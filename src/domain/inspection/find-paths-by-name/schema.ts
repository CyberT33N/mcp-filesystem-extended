import { z } from "zod";
import {
  DISCOVERY_MAX_RESULTS_HARD_CAP,
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
      "Root paths to search in. Broad roots exclude default vendor/cache trees by default, while explicit roots inside excluded trees remain valid. Pass one path for a single search scope or multiple paths for batch path searches."
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
    .describe("Glob patterns that add caller-specific exclusions on top of the default excluded trees for the path search."),
  /**
   * Optional `.gitignore` enrichment toggle.
   *
   * @remarks
   * Enable this property only when root-local `.gitignore` rules should augment
   * the server-owned default traversal exclusions for the current name search.
   *
   * @example
   * ```ts
   * {
   *   respectGitIgnore: true
   * }
   * ```
   */
  respectGitIgnore: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Whether optional root-local `.gitignore` enrichment should add more exclusions to the default traversal policy for this name-based search request."
    ),
  /**
   * Explicit descendant re-include globs.
   *
   * @remarks
   * Use this property to reopen explicitly named descendants beneath excluded
   * trees without disabling the hardened traversal baseline for the full
   * request scope.
   *
   * @example
   * ```ts
   * {
   *   includeExcludedGlobs: ["**\/node_modules/my-package/**"]
   * }
   * ```
   */
  includeExcludedGlobs: z
    .array(z.string().max(GLOB_PATTERN_MAX_CHARS))
    .max(MAX_EXCLUDE_GLOBS_PER_REQUEST)
    .optional()
    .default([])
    .describe(
      "Glob patterns that explicitly reopen descendants beneath default-excluded or caller-excluded trees for this name-based search request without broadening the full root scope."
    ),
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
  maxResults: z
    .number()
    .max(DISCOVERY_MAX_RESULTS_HARD_CAP)
    .optional()
    .default(DISCOVERY_MAX_RESULTS_HARD_CAP)
    .describe("Maximum number of path results to return before truncation."),
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
