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
 * Canonical request contract for guarded fixed-string content search.
 *
 * @remarks
 * This endpoint mirrors the guarded search-family request surface where that alignment remains
 * semantically valid, but replaces free-regex input with one explicit literal-search field.
 */
const SearchFileContentsByFixedStringBaseArgsSchema = z.object({
  [INSPECTION_CONTINUATION_TOKEN_FIELD]: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Opaque continuation token returned by a prior same-endpoint fixed-string-search response. When provided, the request must omit new query-defining fields and the server reloads the persisted request context."
    ),
  roots: z
    .array(z.string().max(PATH_MAX_CHARS))
    .min(1)
    .max(MAX_REGEX_ROOTS_PER_REQUEST)
    .describe(
      "File or directory scopes to search in. Explicit file scopes are searched directly, while directory scopes exclude default vendor/cache trees by default unless explicitly reopened through the shared traversal policy. Pass one scope for a single fixed-string search target or multiple scopes for batch fixed-string searches."
    ),
  fixedString: z
    .string()
    .min(1)
    .max(SHORT_TEXT_MAX_CHARS)
    .describe(
      "Exact fixed-string pattern applied to file contents. This field uses literal substring semantics, not regex syntax and not glob syntax."
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
    .describe("Maximum number of results to return."),
  caseSensitive: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether fixed-string matching should remain case-sensitive."),
});

const SearchFileContentsByFixedStringContinuationArgsSchema = z.object({
  [INSPECTION_CONTINUATION_TOKEN_FIELD]: z
    .string()
    .min(1)
    .describe(
      "Opaque continuation token returned by a prior same-endpoint fixed-string-search response. Continuation-only requests reload the persisted request context and must omit new query-defining fields."
    ),
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
  admission: InspectionContinuationAdmissionSchema,
  continuation: InspectionContinuationMetadataSchema,
});
