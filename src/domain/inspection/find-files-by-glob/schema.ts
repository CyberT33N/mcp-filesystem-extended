import { z } from "zod";
import {
  DISCOVERY_MAX_RESULTS_HARD_CAP,
  GLOB_PATTERN_MAX_CHARS,
  MAX_DISCOVERY_ROOTS_PER_REQUEST,
  MAX_EXCLUDE_GLOBS_PER_REQUEST,
  PATH_MAX_CHARS,
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

export const FindFilesByGlobArgsSchema = z.object({
  [INSPECTION_CONTINUATION_TOKEN_FIELD]: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Opaque continuation token returned by a prior same-endpoint glob-discovery response. When provided, the request must omit new query-defining fields and the server reloads the persisted request context."
    ),
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
    .max(MAX_DISCOVERY_ROOTS_PER_REQUEST)
    .optional()
    .default([])
    .describe(
      "Root directories to search in. Broad roots exclude default vendor/cache trees by default, while explicit roots inside excluded trees remain valid. Base requests pass one path for a single glob search scope or multiple paths for batch glob searches; continuation-only requests omit this field and reload the persisted request context."
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
    .optional()
    .default("")
    .describe(
      "Glob pattern used for path matching, for example '**/*.ts'. Base requests provide this field for path matching; continuation-only requests omit it and reload the persisted request context."
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
    .describe("Glob patterns that add caller-specific exclusions on top of the default excluded trees for the file search scope."),
  /**
   * Optional `.gitignore` enrichment toggle.
   *
   * @remarks
   * Enable this property only when root-local `.gitignore` rules should augment
   * the server-owned default traversal exclusions for the current request.
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
      "Whether optional root-local `.gitignore` enrichment should add more exclusions to the default traversal policy for this glob request."
    ),
  /**
   * Explicit descendant re-include globs.
   *
   * @remarks
   * Use this property to reopen explicitly named descendants beneath default-
   * excluded or caller-excluded trees without disabling the hardened baseline
   * for the full request scope.
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
      "Glob patterns that explicitly reopen descendants beneath default-excluded or caller-excluded trees for this file search request without broadening the full root scope."
    ),
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
}).superRefine((args, ctx) => {
  const continuationRequest = args.continuationToken !== undefined;
  const hasQueryDefiningFields =
    args.roots.length > 0
    || args.glob !== ""
    || args.excludeGlobs.length > 0
    || args.respectGitIgnore
    || args.includeExcludedGlobs.length > 0
    || args.maxResults !== DISCOVERY_MAX_RESULTS_HARD_CAP;

  if (!continuationRequest && args.roots.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Base requests must provide at least one directory root.",
      path: ["roots"],
    });
  }

  if (!continuationRequest && args.glob === "") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Base requests must provide a glob pattern.",
      path: ["glob"],
    });
  }

  if (continuationRequest && hasQueryDefiningFields) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "Continuation-only requests must omit new query-defining fields and rely on the persisted request context.",
      path: [INSPECTION_CONTINUATION_TOKEN_FIELD],
    });
  }
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
  admission: InspectionContinuationAdmissionSchema,
  continuation: InspectionContinuationMetadataSchema,
});
