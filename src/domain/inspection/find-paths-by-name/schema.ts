import { z } from "zod";
import {
  DISCOVERY_MAX_RESULTS_HARD_CAP,
  GLOB_PATTERN_MAX_CHARS,
  LABEL_MAX_CHARS,
  MAX_DISCOVERY_ROOTS_PER_REQUEST,
  MAX_EXCLUDE_GLOBS_PER_REQUEST,
  PATH_MAX_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import {
  INSPECTION_RESUME_ADMISSION_OUTCOMES,
  INSPECTION_RESUME_MODES,
  INSPECTION_RESUME_MODE_FIELD,
  INSPECTION_RESUME_STATUSES,
  INSPECTION_RESUME_TOKEN_FIELD,
} from "@domain/shared/resume/inspection-resume-contract";

const InspectionResumeAdmissionSchema = z.object({
  outcome: z.enum([
    INSPECTION_RESUME_ADMISSION_OUTCOMES.INLINE,
    INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST,
    INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
    INSPECTION_RESUME_ADMISSION_OUTCOMES.NARROWING_REQUIRED,
  ]),
  guidanceText: z.string().nullable(),
  scopeReductionGuidanceText: z.string().nullable(),
});

const InspectionResumeMetadataSchema = z.object({
  resumeToken: z.string().nullable(),
  supportedResumeModes: z.array(
    z.enum([
      INSPECTION_RESUME_MODES.NEXT_CHUNK,
      INSPECTION_RESUME_MODES.COMPLETE_RESULT,
    ]),
  ),
  recommendedResumeMode: z
    .enum([
      INSPECTION_RESUME_MODES.NEXT_CHUNK,
      INSPECTION_RESUME_MODES.COMPLETE_RESULT,
    ])
    .nullable(),
  status: z.enum([
    INSPECTION_RESUME_STATUSES.ACTIVE,
    INSPECTION_RESUME_STATUSES.CANCELLED,
    INSPECTION_RESUME_STATUSES.COMPLETED,
    INSPECTION_RESUME_STATUSES.EXPIRED,
  ]).nullable(),
  resumable: z.boolean(),
  expiresAt: z.string().nullable(),
});

export const FindPathsByNameArgsSchema = z.object({
  [INSPECTION_RESUME_TOKEN_FIELD]: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Opaque resume token returned by a prior same-endpoint name-discovery response. When provided, the request must omit new query-defining fields and the server reloads the persisted request context."
    ),
  [INSPECTION_RESUME_MODE_FIELD]: z
    .enum([
      INSPECTION_RESUME_MODES.NEXT_CHUNK,
      INSPECTION_RESUME_MODES.COMPLETE_RESULT,
    ])
    .optional()
    .describe(
      "Resume intent for a persisted same-endpoint name-discovery session. Resume-only requests must provide either `next-chunk` or `complete-result`."
    ),
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
    .max(MAX_DISCOVERY_ROOTS_PER_REQUEST)
    .optional()
    .default([])
    .describe(
      "Root paths to search in. Broad roots exclude default vendor/cache trees by default, while explicit roots inside excluded trees remain valid. Base requests pass one path for a single search scope or multiple paths for batch path searches; resume-only requests omit this field and reload the persisted request context."
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
    .optional()
    .default("")
    .describe(
      "Case-insensitive substring matched against file and directory names. Base requests provide this field for the initial name search; resume-only requests omit it and reload the persisted request context."
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
}).superRefine((args, ctx) => {
  const resumeRequest = args.resumeToken !== undefined;
  const hasQueryDefiningFields =
    args.roots.length > 0
    || args.nameContains !== ""
    || args.excludeGlobs.length > 0
    || args.respectGitIgnore
    || args.includeExcludedGlobs.length > 0
    || args.maxResults !== DISCOVERY_MAX_RESULTS_HARD_CAP;

  if (!resumeRequest && args.roots.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Base requests must provide at least one search root.",
      path: ["roots"],
    });
  }

  if (!resumeRequest && args.nameContains === "") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Base requests must provide a nameContains filter.",
      path: ["nameContains"],
    });
  }

  if (!resumeRequest && args.resumeMode !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Base requests must not provide a resume mode without a resume token.",
      path: [INSPECTION_RESUME_MODE_FIELD],
    });
  }

  if (resumeRequest && args.resumeMode === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Resume-only requests must provide a resumeMode.",
      path: [INSPECTION_RESUME_MODE_FIELD],
    });
  }

  if (resumeRequest && hasQueryDefiningFields) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "Resume-only requests must omit new query-defining fields and rely on the persisted request context.",
      path: [INSPECTION_RESUME_TOKEN_FIELD],
    });
  }
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
  admission: InspectionResumeAdmissionSchema,
  resume: InspectionResumeMetadataSchema,
});
