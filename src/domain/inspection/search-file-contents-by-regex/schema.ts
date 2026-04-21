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
 * Canonical request contract for guarded regex content search.
 *
 * @remarks
 * The regex endpoint intentionally accepts both explicit file scopes and directory scopes.
 * Shared guardrails still own path validation, traversal hardening, regex runtime safety, and
 * response-budget enforcement, while the endpoint contract owns the architectural decision to
 * normalize mixed file-versus-directory search scopes instead of rejecting explicit file inputs.
 */
const SearchFileContentsByRegexBaseArgsSchema = z.object({
  [INSPECTION_CONTINUATION_TOKEN_FIELD]: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Opaque continuation token returned by a prior same-endpoint regex-search response. When provided, the request must omit new query-defining fields and the server reloads the persisted request context."
    ),
  /**
   * Search scopes.
   *
   * @remarks
   * Use this property to define the file or directory scopes whose file contents may be scanned by
   * the regex search pipeline. Explicit file scopes are searched directly, while directory scopes
   * continue through the guarded traversal pipeline.
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
      "File or directory scopes to search in. Explicit file scopes are searched directly, while directory scopes exclude default vendor/cache trees by default unless explicitly reopened through the shared traversal policy. Pass one scope for a single regex search target or multiple scopes for batch regex searches."
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
      "Glob patterns used to limit which files are searched before the regex is applied to file contents. These file filters do not reopen default-excluded trees by themselves."
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
    .describe("Glob patterns that add caller-specific exclusions on top of the default excluded trees for the regex search scope."),
  /**
   * Optional `.gitignore` enrichment toggle.
   *
   * @remarks
   * Enable this property only when root-local `.gitignore` rules should augment
   * the server-owned default traversal exclusions for the current regex request.
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
      "Whether optional root-local `.gitignore` enrichment should add more exclusions to the default traversal policy for this regex request."
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
      "Glob patterns that explicitly reopen descendants beneath default-excluded or caller-excluded trees for this regex search request without changing the file-filter role of `includeGlobs`."
    ),
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

const SearchFileContentsByRegexContinuationArgsSchema = z.object({
  [INSPECTION_CONTINUATION_TOKEN_FIELD]: z
    .string()
    .min(1)
    .describe(
      "Opaque continuation token returned by a prior same-endpoint regex-search response. Continuation-only requests reload the persisted request context and must omit new query-defining fields."
    ),
}).strict();

export const SearchFileContentsByRegexArgsSchema = z.union([
  SearchFileContentsByRegexBaseArgsSchema,
  SearchFileContentsByRegexContinuationArgsSchema,
]);

export const SearchFileContentsByRegexResultSchema = z.object({
  /**
   * Per-root regex results.
   *
   * @remarks
   * This property preserves one structured search result per requested file or directory scope so
   * callers can inspect direct-file results and traversal-backed directory results through one
   * unified response surface.
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
      /**
       * Root-local failure surface.
       *
       * @remarks
       * This property carries one root-local operational failure without collapsing
       * the whole multi-root response surface.
       *
       * @example
       * ```ts
       * {
       *   error: "Native search runner timed out before completion."
       * }
       * ```
       */
      error: z.string().nullable(),
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
  admission: InspectionContinuationAdmissionSchema,
  continuation: InspectionContinuationMetadataSchema,
});
