import { z } from "zod";
import {
  GLOB_PATTERN_MAX_CHARS,
  MAX_EXCLUDE_GLOBS_PER_REQUEST,
  MAX_GENERIC_PATHS_PER_REQUEST,
  MAX_INCLUDE_GLOBS_PER_REQUEST,
  PATH_MAX_CHARS,
  REGEX_PATTERN_MAX_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import {
  INSPECTION_CONTINUATION_ADMISSION_OUTCOMES,
  INSPECTION_CONTINUATION_STATUSES,
  INSPECTION_CONTINUATION_TOKEN_FIELD,
} from "@domain/shared/continuation/inspection-continuation-contract";

const InspectionContinuationAdmissionSchema = z.object({
  outcome: z.enum([
    INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.INLINE,
    INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.PREVIEW_FIRST,
    INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.TASK_BACKED_REQUIRED,
  ]),
  guidanceText: z.string().nullable(),
  resumable: z.boolean(),
});

const InspectionContinuationMetadataSchema = z.object({
  continuationToken: z.string().nullable(),
  familyMember: z.string().nullable(),
  status: z.enum([
    INSPECTION_CONTINUATION_STATUSES.ACTIVE,
    INSPECTION_CONTINUATION_STATUSES.CANCELLED,
    INSPECTION_CONTINUATION_STATUSES.COMPLETED,
    INSPECTION_CONTINUATION_STATUSES.EXPIRED,
  ]).nullable(),
  resumable: z.boolean(),
  expiresAt: z.string().nullable(),
});

/**
 * Defines the request contract for the count-lines inspection endpoint.
 *
 * @remarks
 * This schema keeps statically expressible limits at the contract layer so path
 * fan-out, regex length, and glob breadth are rejected before recursive
 * traversal begins. The public request surface stays stable while the handler
 * now routes total-only counting through the streaming line counter and
 * pattern-aware counting through the shared native-search lane. Dynamic output
 * growth is still enforced later by the handler-level text budget and the
 * global response fuse.
 */
export const CountLinesArgsSchema = z.object({
  [INSPECTION_CONTINUATION_TOKEN_FIELD]: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Opaque continuation token returned by a prior same-endpoint count-lines response. When provided, the request must omit new query-defining fields and the server reloads the persisted request context."
    ),
  /**
   * Count scope paths.
   *
   * @remarks
   * Use this property to declare the files or directories whose line totals
   * should be evaluated within the request batch limit.
   *
   * @example
   * ```ts
   * {
   *   paths: ["src", "PLAN.md"]
   * }
   * ```
   */
  paths: z.array(z.string().max(PATH_MAX_CHARS)).min(1).max(MAX_GENERIC_PATHS_PER_REQUEST).describe("Paths to files or directories to count. Broad directory roots exclude default vendor/cache trees by default, while explicit roots inside excluded trees remain valid. Pass one path for a single count scope or multiple paths for batch line counting."),
  /**
   * Recursive traversal switch.
   *
   * @remarks
   * Enable this property when directory inputs should traverse nested files
   * instead of rejecting directory-only requests.
   *
   * @example
   * ```ts
   * {
   *   recursive: true
   * }
   * ```
   */
  recursive: z.boolean().optional().default(false).describe("Whether to recursively count lines in directories. Recursive traversal still respects the default excluded trees unless callers target them explicitly or reopen descendants."),
  /**
   * Optional line filter regex.
   *
   * @remarks
   * Provide this property to count only lines whose text matches the supplied
   * regular expression after schema-level pattern limits are enforced.
   *
   * @example
   * ```ts
   * {
   *   regex: "TODO|FIXME"
   * }
   * ```
   */
  regex: z.string().max(REGEX_PATTERN_MAX_CHARS).optional().describe("Regular expression applied to counted lines. This field uses regex syntax, not glob syntax and not plain substring matching."),
  /**
   * Include glob filters.
   *
   * @remarks
   * Use this property to narrow recursive counting to specific file-name or
   * path patterns before line totals are calculated.
   *
   * @example
   * ```ts
   * {
   *   includeGlobs: ["**\/*.ts", "**\/*.md"]
   * }
   * ```
   */
  includeGlobs: z.array(z.string().max(GLOB_PATTERN_MAX_CHARS)).max(MAX_INCLUDE_GLOBS_PER_REQUEST).optional().default(["**"]).describe("Glob patterns used to limit which files are included when counting recursively. These file filters do not reopen default-excluded trees by themselves."),
  /**
   * Exclude glob filters.
   *
   * @remarks
   * Use this property to remove generated, vendor, or otherwise irrelevant
   * paths from the recursive counting surface.
   *
   * @example
   * ```ts
   * {
   *   excludeGlobs: ["**\/node_modules/**", "**\/dist/**"]
   * }
   * ```
   */
  excludeGlobs: z.array(z.string().max(GLOB_PATTERN_MAX_CHARS)).max(MAX_EXCLUDE_GLOBS_PER_REQUEST).optional().default([]).describe("Glob patterns that add caller-specific exclusions on top of the default excluded trees for the counting scope."),
  /**
   * Optional `.gitignore` enrichment toggle.
   *
   * @remarks
   * Enable this property only when root-local `.gitignore` rules should augment
   * the server-owned default traversal exclusions for the current count-lines request.
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
      "Whether optional root-local `.gitignore` enrichment should add more exclusions to the default traversal policy for this count-lines request.",
    ),
  /**
   * Explicit descendant re-include globs.
   *
   * @remarks
   * Use this property to reopen explicitly named descendants beneath default-
   * excluded or caller-excluded trees without changing the baseline file-filter
   * role of `includeGlobs`.
   *
   * @example
   * ```ts
   * {
   *   includeExcludedGlobs: ["**\\/node_modules/my-package/**"]
   * }
   * ```
   */
  includeExcludedGlobs: z
    .array(z.string().max(GLOB_PATTERN_MAX_CHARS))
    .max(MAX_EXCLUDE_GLOBS_PER_REQUEST)
    .optional()
    .default([])
    .describe(
      "Glob patterns that explicitly reopen descendants beneath default-excluded or caller-excluded trees for this count-lines request without changing the file-filter role of `includeGlobs`.",
    ),
  /**
   * Empty-line handling mode.
   *
   * @remarks
   * Enable this property when blank lines should be ignored so the reported
   * totals focus on non-empty source content.
   *
   * @example
   * ```ts
   * {
   *   ignoreEmptyLines: true
   * }
   * ```
   */
  ignoreEmptyLines: z.boolean().optional().default(false).describe("Whether to ignore empty lines"),
});

/**
 * Defines the structured result contract for count-lines responses.
 *
 * @remarks
 * The result preserves per-path aggregation while leaving response-size
 * protection to the handler and the global fuse, which prevents recursive
 * discovery output from growing without a final non-bypassable cap.
 */
export const CountLinesResultSchema = z.object({
  /**
   * Per-request path results.
   *
   * @remarks
   * This property preserves the structured output for each requested path so
   * callers can inspect file-level detail and aggregate totals together.
   *
   * @example
   * ```ts
   * {
   *   paths: [{ path: "src", files: [], totalLines: 0, totalMatchingLines: 0 }]
   * }
   * ```
   */
  paths: z.array(
    z.object({
      /**
       * Requested path echo.
       *
       * @remarks
       * This property identifies which requested file-system scope produced the
       * nested counting result.
       *
       * @example
       * ```ts
       * {
       *   path: "src"
       * }
       * ```
       */
      path: z.string(),
      /**
       * File-level count entries.
       *
       * @remarks
       * This property contains the file-by-file totals that were collected for
       * the requested path after filtering and traversal rules were applied.
       *
       * @example
       * ```ts
       * {
       *   files: [{ file: "src/app.ts", count: 120, matchingCount: 3 }]
       * }
       * ```
       */
      files: z.array(
        z.object({
          /**
           * Counted file path.
           *
           * @remarks
           * This property names the individual file whose line totals are
           * represented by the current entry.
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
           * Total line count.
           *
           * @remarks
           * This property reports the full line count for the file after any
           * empty-line handling rule has been applied.
           *
           * @example
           * ```ts
           * {
           *   count: 120
           * }
           * ```
           */
          count: z.number(),
          /**
           * Matching line count.
           *
           * @remarks
           * This optional property is present when the request supplied a regex
           * and reports how many lines matched that pattern.
           *
           * @example
           * ```ts
           * {
           *   matchingCount: 3
           * }
           * ```
           */
          matchingCount: z.number().optional(),
        }),
      ),
      /**
       * Path-level total lines.
       *
       * @remarks
       * This property aggregates the line totals of all files collected beneath
       * the current requested path.
       *
       * @example
       * ```ts
       * {
       *   totalLines: 420
       * }
       * ```
       */
      totalLines: z.number(),
      /**
       * Path-level matching line total.
       *
       * @remarks
       * This property aggregates the matching-line counts for the current path
       * when regex filtering is active.
       *
       * @example
       * ```ts
       * {
       *   totalMatchingLines: 12
       * }
       * ```
       */
      totalMatchingLines: z.number(),
    }),
  ),
  /**
   * Overall file count.
   *
   * @remarks
   * This property reports how many concrete files contributed to the full
   * request result across every requested path.
   *
   * @example
   * ```ts
   * {
   *   totalFiles: 18
   * }
   * ```
   */
  totalFiles: z.number(),
  /**
   * Overall line total.
   *
   * @remarks
   * This property aggregates the line counts across the entire request scope.
   *
   * @example
   * ```ts
   * {
   *   totalLines: 420
   * }
   * ```
   */
  totalLines: z.number(),
  /**
   * Overall matching-line total.
   *
   * @remarks
   * This property aggregates all regex-matching line counts across the full
   * request result.
   *
   * @example
   * ```ts
   * {
   *   totalMatchingLines: 12
   * }
   * ```
   */
  totalMatchingLines: z.number(),
  admission: InspectionContinuationAdmissionSchema,
  continuation: InspectionContinuationMetadataSchema,
});
