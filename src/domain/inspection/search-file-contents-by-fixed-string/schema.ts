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

/**
 * Canonical request contract for guarded fixed-string content search.
 *
 * @remarks
 * This endpoint mirrors the guarded search-family request surface where that alignment remains
 * semantically valid, but replaces free-regex input with one explicit literal-search field.
 */
export const SearchFileContentsByFixedStringArgsSchema = z.object({
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
});
