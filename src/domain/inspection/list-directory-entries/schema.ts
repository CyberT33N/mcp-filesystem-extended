import { z } from "zod";
import type { FileSystemEntryMetadata } from "@domain/inspection/shared/filesystem-entry-metadata-contract";
import {
  DefaultedFileSystemEntryMetadataSelectionSchema,
  FileSystemEntryMetadataSchema,
} from "@domain/inspection/shared/filesystem-entry-metadata-contract";
import {
  GLOB_PATTERN_MAX_CHARS,
  MAX_DISCOVERY_ROOTS_PER_REQUEST,
  MAX_EXCLUDE_GLOBS_PER_REQUEST,
  PATH_MAX_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import {
  applyCommonResumeSchemaRefinement,
  InspectionResumeAdmissionSchema,
  InspectionResumeMetadataSchema,
  InspectionResumeModeFieldSchema,
  InspectionResumeTokenFieldSchema,
  INSPECTION_RESUME_MODE_FIELD,
  INSPECTION_RESUME_TOKEN_FIELD,
} from "@domain/shared/resume/inspection-resume-contract";

/**
 * Input schema for the `list_directory_entries` tool.
 */
export const ListDirectoryEntriesArgsSchema = z.object({
  [INSPECTION_RESUME_TOKEN_FIELD]: InspectionResumeTokenFieldSchema("directory-listing"),
  [INSPECTION_RESUME_MODE_FIELD]: InspectionResumeModeFieldSchema,
  /**
   * Listing roots.
   *
   * @remarks
   * Use this property to define the directories whose entries should be listed
   * in request order.
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
      "Paths to directories to list. Broad roots exclude default vendor/cache trees by default, while explicit roots inside excluded trees remain valid. Base requests pass one path for a single listing root or multiple paths for batch listing roots; resume-only requests omit this field and reload the persisted request context."
    ),
  /**
   * Recursive traversal mode.
   *
   * @remarks
   * Enable this property when nested children should be collected instead of
   * limiting the output to the first directory level.
   *
   * @example
   * ```ts
   * {
   *   recursive: false
   * }
   * ```
   */
  recursive: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Whether nested directory content should be traversed recursively. Defaults to false so broad-root listing remains same-level unless callers explicitly opt into deep traversal, and recursive traversal still respects the default excluded trees unless callers target them explicitly or reopen descendants."
    ),
  /**
   * Metadata selection.
   *
   * @remarks
   * This property narrows the optional metadata groups that should accompany
   * every listed entry.
   *
   * @example
   * ```ts
   * {
   *   metadata: { timestamps: true, permissions: true }
   * }
   * ```
   */
  metadata: DefaultedFileSystemEntryMetadataSelectionSchema.describe(
    "Optional grouped metadata selectors. `size` and `type` are always returned. Set `timestamps` and/or `permissions` to true to include those groups."
  ),
  /**
   * Listing exclusions.
   *
   * @remarks
   * Use this property to remove matching entries from the structured listing so
   * callers can suppress irrelevant or noisy paths.
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
    .describe(
      "Glob-like patterns that add caller-specific exclusions on top of the default excluded trees for the structured listing output."
    ),
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
      "Whether optional root-local `.gitignore` enrichment should add more exclusions to the default traversal policy for this listing request."
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
      "Glob patterns that explicitly reopen descendants beneath default-excluded or caller-excluded trees for this listing request without broadening the full root scope."
    ),
}).superRefine((args, ctx) => {
  const resumeRequest = args.resumeToken !== undefined;
  const hasQueryDefiningFields =
    args.roots.length > 0
    || args.recursive
    || args.excludeGlobs.length > 0
    || args.respectGitIgnore
    || args.includeExcludedGlobs.length > 0;

  if (!resumeRequest && args.roots.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Base requests must provide at least one directory root.",
      path: ["roots"],
    });
  }

  applyCommonResumeSchemaRefinement(args, ctx, hasQueryDefiningFields);
});

/**
 * Structured directory entry returned by the directory-entry listing result.
 */
interface ListedDirectoryEntryOutput extends FileSystemEntryMetadata {
  /**
   * Leaf entry name.
   */
  name: string;

  /**
   * Entry path relative to the requested root path.
   */
  path: string;

  /**
   * Nested child entries when recursive traversal is enabled.
   */
  children?: ListedDirectoryEntryOutput[] | undefined;
}

/**
 * Structured listing root returned for one requested directory path.
 */
interface ListedDirectoryRootOutput {
  /**
   * Directory path exactly as requested by the caller.
   */
  requestedPath: string;

  /**
   * Structured entries rooted beneath the requested path.
   */
  entries: ListedDirectoryEntryOutput[];
}

/**
 * Structured result returned by the directory-entry listing surface.
 */
interface ListDirectoryEntriesStructuredResult {
  /**
   * Listing roots in request order.
   */
  roots: ListedDirectoryRootOutput[];
}

const ListedDirectoryEntryBaseSchema = FileSystemEntryMetadataSchema.extend({
  /**
   * Entry name.
   *
   * @remarks
   * This property exposes the leaf name of the listed directory entry without
   * repeating the full relative path.
   *
   * @example
   * ```ts
   * {
   *   name: "schema.ts"
   * }
   * ```
   */
  name: z.string(),
  /**
   * Relative entry path.
   *
   * @remarks
   * This property reports the path of the entry relative to the requested root
   * so callers can reconstruct structure without absolute filesystem leakage.
   *
   * @example
   * ```ts
   * {
   *   path: "domain/inspection/schema.ts"
   * }
   * ```
   */
  path: z.string(),
});

export const ListedDirectoryEntryOutputSchema: z.ZodType<ListedDirectoryEntryOutput> = z.lazy(
  () =>
    ListedDirectoryEntryBaseSchema.extend({
      /**
       * Nested child entries.
       *
       * @remarks
       * This optional property is present when recursive traversal includes the
       * current entry's descendants in the structured listing response.
       *
       * @example
       * ```ts
       * {
       *   children: [{ name: "schema.ts", path: "domain/schema.ts" }]
       * }
       * ```
       */
      children: z.array(ListedDirectoryEntryOutputSchema).optional(),
    }),
);

export const ListDirectoryEntriesStructuredResultSchema: z.ZodType<ListDirectoryEntriesStructuredResult> =
  z.object({
    /**
     * Listing roots.
     *
     * @remarks
     * This property preserves one structured listing payload per requested root
     * directory.
     *
     * @example
     * ```ts
     * {
     *   roots: [{ requestedPath: "src", entries: [] }]
     * }
     * ```
     */
    roots: z.array(
      z.object({
        /**
         * Requested root echo.
         *
         * @remarks
         * This property repeats the root path exactly as the caller supplied it.
         *
         * @example
         * ```ts
         * {
         *   requestedPath: "src"
         * }
         * ```
         */
        requestedPath: z.string(),
        /**
         * Structured root entries.
         *
         * @remarks
         * This property contains the entry tree collected beneath the current
         * requested root.
         *
         * @example
         * ```ts
         * {
         *   entries: [{ name: "domain", path: "domain" }]
         * }
         * ```
         */
        entries: z.array(ListedDirectoryEntryOutputSchema),
      }),
    ),
    admission: InspectionResumeAdmissionSchema,
    resume: InspectionResumeMetadataSchema,
  });
