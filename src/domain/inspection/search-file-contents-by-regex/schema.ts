import { z } from "zod";

import {
  GLOB_PATTERN_MAX_CHARS,
  MAX_EXCLUDE_GLOBS_PER_REQUEST,
  MAX_INCLUDE_GLOBS_PER_REQUEST,
  MAX_REGEX_ROOTS_PER_REQUEST,
  PATH_MAX_CHARS,
  REGEX_PATTERN_MAX_CHARS,
  REGEX_SEARCH_MAX_RESULTS_HARD_CAP,
} from "@domain/shared/guardrails/tool-guardrail-limits";

export const SearchFileContentsByRegexArgsSchema = z.object({
  /**
   * Search roots.
   *
   * @remarks
   * Use this property to define the root directories whose file contents may be
   * scanned by the regex search pipeline.
   *
   * @example
   * ```ts
   * {
   *   roots: ["src"]
   * }
   * ```
   */
  roots: z
    .array(z.string().max(PATH_MAX_CHARS))
    .min(1)
    .max(MAX_REGEX_ROOTS_PER_REQUEST)
    .describe(
      "Root directories to search in. Pass one path for a single regex search scope or multiple paths for batch regex searches."
    ),
  /**
   * Regex pattern.
   *
   * @remarks
   * This property provides the raw regular expression that will be validated by
   * the structural runtime safety layer before content scanning proceeds.
   *
   * @example
   * ```ts
   * {
   *   regex: "TODO|FIXME"
   * }
   * ```
   */
  regex: z
    .string()
    .min(1)
    .max(REGEX_PATTERN_MAX_CHARS)
    .describe(
      "Regular expression applied to file contents. This field uses regex syntax, not glob syntax and not plain substring matching."
    ),
  /**
   * Include globs.
   *
   * @remarks
   * Use this property to narrow candidate files before regex evaluation so the
   * runtime budget focuses on relevant file types.
   *
   * @example
   * ```ts
   * {
   *   includeGlobs: ["*.ts", "*.md"]
   * }
   * ```
   */
  includeGlobs: z
    .array(z.string().max(GLOB_PATTERN_MAX_CHARS))
    .max(MAX_INCLUDE_GLOBS_PER_REQUEST)
    .optional()
    .default([])
    .describe(
      "Glob patterns used to limit which files are searched before the regex is applied to file contents."
    ),
  /**
   * Exclude globs.
   *
   * @remarks
   * Use this property to remove paths from traversal before regex evaluation,
   * even if they sit beneath a requested root.
   *
   * @example
   * ```ts
   * {
   *   excludeGlobs: ["**\/dist/**"]
   * }
   * ```
   */
  excludeGlobs: z
    .array(z.string().max(GLOB_PATTERN_MAX_CHARS))
    .max(MAX_EXCLUDE_GLOBS_PER_REQUEST)
    .optional()
    .default([])
    .describe("Glob patterns that should be excluded from the regex search scope."),
  /**
   * Match location cap.
   *
   * @remarks
   * This property limits how many match locations may be returned before the
   * response is marked truncated by the runtime fuse.
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
    .int()
    .min(1)
    .max(REGEX_SEARCH_MAX_RESULTS_HARD_CAP)
    .optional()
    .default(100)
    .describe("Maximum number of results to return"),
  /**
   * Case-sensitivity flag.
   *
   * @remarks
   * Enable this property when regex matching should preserve case instead of
   * using the default case-insensitive behavior.
   *
   * @example
   * ```ts
   * {
   *   caseSensitive: true
   * }
   * ```
   */
  caseSensitive: z.boolean().optional().default(false).describe("Whether the search should be case-sensitive"),
});

export const SearchFileContentsByRegexResultSchema = z.object({
  /**
   * Per-root regex results.
   *
   * @remarks
   * This property preserves one structured search result per requested root so
   * callers can inspect root-local traversal output.
   *
   * @example
   * ```ts
   * {
   *   roots: [{ root: "src", matches: [], filesSearched: 0, totalMatches: 0, truncated: false }]
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
       * search result segment.
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
       * Match locations.
       *
       * @remarks
       * This property contains the collected file, line, and excerpt payloads
       * that survived regex runtime guardrail enforcement.
       *
       * @example
       * ```ts
       * {
       *   matches: [{ file: "src/app.ts", line: 12, content: "TODO: fix", match: "TODO" }]
       * }
       * ```
       */
      matches: z.array(
        z.object({
          /**
           * Matched file path.
           *
           * @remarks
           * This property identifies the file that contains the reported match.
           *
           * @example
           * ```ts
           * {
           *   file: "src/app.ts"
           * }
           * ```
           */
          file: z.string(),
          /**
           * Matched line number.
           *
           * @remarks
           * This property reports the 1-based line number associated with the
           * emitted match excerpt.
           *
           * @example
           * ```ts
           * {
           *   line: 12
           * }
           * ```
           */
          line: z.number(),
          /**
           * Normalized line excerpt.
           *
           * @remarks
           * This property contains the shaped line excerpt returned to callers
           * after runtime excerpt normalization.
           *
           * @example
           * ```ts
           * {
           *   content: "TODO: fix this guardrail"
           * }
           * ```
           */
          content: z.string(),
          /**
           * Matched substring.
           *
           * @remarks
           * This property exposes the concrete substring captured by the regex
           * engine for the reported location.
           *
           * @example
           * ```ts
           * {
           *   match: "TODO"
           * }
           * ```
           */
          match: z.string(),
        }),
      ),
      /**
       * Files searched count.
       *
       * @remarks
       * This property reports how many candidate files were scanned beneath the
       * current root while budgets allowed traversal.
       *
       * @example
       * ```ts
       * {
       *   filesSearched: 8
       * }
       * ```
       */
      filesSearched: z.number(),
      /**
       * Total matches encountered.
       *
       * @remarks
       * This property counts every regex match found under the root before any
       * result truncation cut off further collection.
       *
       * @example
       * ```ts
       * {
       *   totalMatches: 14
       * }
       * ```
       */
      totalMatches: z.number(),
      /**
       * Root truncation flag.
       *
       * @remarks
       * This property indicates whether the current root result stopped early
       * because the effective result limit was reached.
       *
       * @example
       * ```ts
       * {
       *   truncated: true
       * }
       * ```
       */
      truncated: z.boolean(),
    }),
  ),
  /**
   * Aggregate location count.
   *
   * @remarks
   * This property reports how many match locations were returned across all
   * roots after runtime shaping.
   *
   * @example
   * ```ts
   * {
   *   totalLocations: 10
   * }
   * ```
   */
  totalLocations: z.number(),
  /**
   * Aggregate match count.
   *
   * @remarks
   * This property reports how many total regex matches were encountered across
   * all roots before aggregation completed.
   *
   * @example
   * ```ts
   * {
   *   totalMatches: 14
   * }
   * ```
   */
  totalMatches: z.number(),
  /**
   * Aggregate truncation flag.
   *
   * @remarks
   * This property becomes true when any root-level regex search result reached
   * the effective result ceiling.
   *
   * @example
   * ```ts
   * {
   *   truncated: true
   * }
   * ```
   */
  truncated: z.boolean(),
});
