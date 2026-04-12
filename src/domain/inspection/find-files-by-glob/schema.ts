import { z } from "zod";
import {
  DISCOVERY_MAX_RESULTS_HARD_CAP,
  GLOB_PATTERN_MAX_CHARS,
  MAX_DISCOVERY_ROOTS_PER_REQUEST,
  MAX_EXCLUDE_GLOBS_PER_REQUEST,
  PATH_MAX_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";

export const FindFilesByGlobArgsSchema = z.object({
  /**
   * Search roots.
   *
   * @remarks
   * Use this property to define the directory roots whose descendants should be
   * matched against the provided glob pattern.
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
      "Root directories to search in. Pass one path for a single glob search scope or multiple paths for batch glob searches."
    ),
  /**
   * Match glob.
   *
   * @remarks
   * This property provides the path-oriented glob expression that selects
   * matching files beneath each requested root.
   *
   * @example
   * ```ts
   * {
   *   glob: "**\/*.ts"
   * }
   * ```
   */
  glob: z
    .string()
    .max(GLOB_PATTERN_MAX_CHARS)
    .describe(
      "Glob pattern used for path matching, for example '**/*.ts'. This field is evaluated against paths, not file contents."
    ),
  /**
   * Exclusion globs.
   *
   * @remarks
   * Use this property to remove directories or files that should be skipped
   * even if they match the primary search glob.
   *
   * @example
   * ```ts
   * {
   *   excludeGlobs: ["**\/dist/**", "**\/coverage/**"]
   * }
   * ```
   */
  excludeGlobs: z
    .array(z.string().max(GLOB_PATTERN_MAX_CHARS))
    .max(MAX_EXCLUDE_GLOBS_PER_REQUEST)
    .optional()
    .default([])
    .describe("Glob patterns that should be excluded from the file search scope."),
  /**
   * Result ceiling.
   *
   * @remarks
   * This property narrows how many file matches may be returned before the
   * search reports truncation.
   *
   * @example
   * ```ts
   * {
   *   maxResults: 50
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

export const FindFilesByGlobResultSchema = z.object({
  /**
   * Per-root glob results.
   *
   * @remarks
   * This property preserves individual root outputs so callers can see which
   * root produced which match set.
   *
   * @example
   * ```ts
   * {
   *   roots: [{ root: "src", matches: ["src/index.ts"], truncated: false }]
   * }
   * ```
   */
  roots: z.array(
    z.object({
      /**
       * Root echo.
       *
       * @remarks
       * This property repeats the requested root that produced the current
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
       * Matched paths.
       *
       * @remarks
       * This property lists the concrete files that matched the request glob
       * within the current root.
       *
       * @example
       * ```ts
       * {
       *   matches: ["src/index.ts", "src/app.ts"]
       * }
       * ```
       */
      matches: z.array(z.string()),
      /**
       * Root truncation flag.
       *
       * @remarks
       * This property reports whether the current root stopped collecting
       * results because the effective cap was reached.
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
   * This property reports how many file paths were collected across all roots.
   *
   * @example
   * ```ts
   * {
   *   totalMatches: 2
   * }
   * ```
   */
  totalMatches: z.number(),
  /**
   * Aggregate truncation flag.
   *
   * @remarks
   * This property becomes true when any root result hit the effective result
   * cap before traversal completed.
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
