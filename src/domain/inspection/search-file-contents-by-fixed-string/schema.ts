import { z } from "zod";

import {
  GLOB_PATTERN_MAX_CHARS,
  MAX_EXCLUDE_GLOBS_PER_REQUEST,
  MAX_INCLUDE_GLOBS_PER_REQUEST,
  MAX_REGEX_ROOTS_PER_REQUEST,
  PATH_MAX_CHARS,
  REGEX_SEARCH_MAX_RESULTS_HARD_CAP,
  SHORT_TEXT_MAX_CHARS,
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
  recommendedResumeMode: z.enum([
    INSPECTION_RESUME_MODES.NEXT_CHUNK,
    INSPECTION_RESUME_MODES.COMPLETE_RESULT,
  ]).nullable(),
  status: z.enum([
    INSPECTION_RESUME_STATUSES.ACTIVE,
    INSPECTION_RESUME_STATUSES.CANCELLED,
    INSPECTION_RESUME_STATUSES.COMPLETED,
    INSPECTION_RESUME_STATUSES.EXPIRED,
  ]).nullable(),
  resumable: z.boolean(),
  expiresAt: z.string().nullable(),
});

/**
 * Canonical request contract for guarded fixed-string content search.
 *
 * @remarks
 * This endpoint mirrors the guarded search-family request surface where that alignment remains
 * semantically valid, but replaces free-regex input with one explicit literal-search field.
 */
const SearchFileContentsByFixedStringBaseArgsSchema = z.object({
  [INSPECTION_RESUME_TOKEN_FIELD]: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Opaque resume token returned by a prior same-endpoint fixed-string-search response. When provided, the request must omit new query-defining fields and the server reloads the persisted request context."
    ),
  [INSPECTION_RESUME_MODE_FIELD]: z
    .enum([
      INSPECTION_RESUME_MODES.NEXT_CHUNK,
      INSPECTION_RESUME_MODES.COMPLETE_RESULT,
    ])
    .optional()
    .describe(
      "Resume intent for a persisted same-endpoint fixed-string-search session. Resume-only requests must provide either `next-chunk` or `complete-result`."
    ),
  roots: z
    .array(z.string().max(PATH_MAX_CHARS))
    .max(MAX_REGEX_ROOTS_PER_REQUEST)
    .optional()
    .default([])
    .describe(
      "File or directory scopes to search in. Explicit file scopes are searched directly, while directory scopes exclude default vendor/cache trees by default unless explicitly reopened through the shared traversal policy. Base requests provide one or more scopes, while resume-only requests omit this field and reload the persisted request context."
    ),
  fixedString: z
    .string()
    .max(SHORT_TEXT_MAX_CHARS)
    .optional()
    .default("")
    .describe(
      "Exact fixed-string pattern applied to file contents. Base requests provide this field for the initial literal search; resume-only requests omit it and reload the persisted request context."
    ),
  includeGlobs: z
    .array(z.string().max(GLOB_PATTERN_MAX_CHARS))
    .max(MAX_INCLUDE_GLOBS_PER_REQUEST)
    .optional()
    .default([])
    .describe(
      "Glob patterns used to limit which files are searched before the fixed-string matcher is applied to file contents. These file filters do not reopen default-excluded trees by themselves."
    ),
  excludeGlobs: z
    .array(z.string().max(GLOB_PATTERN_MAX_CHARS))
    .max(MAX_EXCLUDE_GLOBS_PER_REQUEST)
    .optional()
    .default([])
    .describe(
      "Glob patterns that add caller-specific exclusions on top of the default excluded trees for the fixed-string search scope."
    ),
  respectGitIgnore: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Whether optional root-local `.gitignore` enrichment should add more exclusions to the default traversal policy for this fixed-string search request."
    ),
  includeExcludedGlobs: z
    .array(z.string().max(GLOB_PATTERN_MAX_CHARS))
    .max(MAX_EXCLUDE_GLOBS_PER_REQUEST)
    .optional()
    .default([])
    .describe(
      "Glob patterns that explicitly reopen descendants beneath default-excluded or caller-excluded trees for this fixed-string search request without changing the file-filter role of `includeGlobs`."
    ),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(REGEX_SEARCH_MAX_RESULTS_HARD_CAP)
    .optional()
    .default(100)
    .describe("Maximum number of results to return before truncation."),
  caseSensitive: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether fixed-string matching should remain case-sensitive."),
}).superRefine((args, ctx) => {
  const resumeRequest = args.resumeToken !== undefined;
  const hasQueryDefiningFields =
    args.roots.length > 0
    || args.fixedString !== ""
    || args.includeGlobs.length > 0
    || args.excludeGlobs.length > 0
    || args.respectGitIgnore
    || args.includeExcludedGlobs.length > 0
    || args.maxResults !== 100
    || args.caseSensitive;

  if (!resumeRequest && args.roots.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Base requests must provide at least one fixed-string search root.",
      path: ["roots"],
    });
  }

  if (!resumeRequest && args.fixedString === "") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Base requests must provide a fixedString pattern.",
      path: ["fixedString"],
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

const SearchFileContentsByFixedStringContinuationArgsSchema = z.object({
  [INSPECTION_RESUME_TOKEN_FIELD]: z
    .string()
    .min(1)
    .describe(
      "Opaque resume token returned by a prior same-endpoint fixed-string-search response. Resume-only requests reload the persisted request context and must omit new query-defining fields."
    ),
  [INSPECTION_RESUME_MODE_FIELD]: z.enum([
    INSPECTION_RESUME_MODES.NEXT_CHUNK,
    INSPECTION_RESUME_MODES.COMPLETE_RESULT,
  ]),
}).strict();

export const SearchFileContentsByFixedStringArgsSchema = z.union([
  SearchFileContentsByFixedStringBaseArgsSchema,
  SearchFileContentsByFixedStringContinuationArgsSchema,
]);

/**
 * Structured result contract for guarded fixed-string content search.
 *
 * @remarks
 * The result surface intentionally stays parallel to the guarded regex endpoint so callers can
 * consume literal and regex search through one aligned per-root response shape.
 */
export const SearchFileContentsByFixedStringResultSchema = z.object({
  roots: z.array(
    z.object({
      root: z.string(),
      matches: z.array(
        z.object({
          file: z.string(),
          line: z.number(),
          content: z.string(),
          match: z.string(),
        })
      ),
      filesSearched: z.number(),
      totalMatches: z.number(),
      truncated: z.boolean(),
      error: z.string().nullable(),
    })
  ),
  totalLocations: z.number(),
  totalMatches: z.number(),
  truncated: z.boolean(),
  admission: InspectionResumeAdmissionSchema,
  resume: InspectionResumeMetadataSchema,
});
