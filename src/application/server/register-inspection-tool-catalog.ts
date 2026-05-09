import {
  getPathMetadataResult,
  handleGetPathMetadata,
} from "@domain/inspection/get-path-metadata/handler";
import {
  GetPathMetadataArgsSchema,
  GetPathMetadataResultSchema,
} from "@domain/inspection/get-path-metadata/schema";
import {
  getListDirectoryEntriesResult,
  handleListDirectoryEntries,
} from "@domain/inspection/list-directory-entries/handler";
import {
  ListDirectoryEntriesArgsSchema,
  ListDirectoryEntriesStructuredResultSchema,
} from "@domain/inspection/list-directory-entries/schema";
import { handleReadFiles } from "@domain/inspection/read-files-with-line-numbers/handler";
import { ReadFilesWithLineNumbersArgsSchema } from "@domain/inspection/read-files-with-line-numbers/schema";
import {
  getReadFileContentResult,
  handleReadFileContent,
} from "@domain/inspection/read-file-content/handler";
import {
  ReadFileContentFlatArgsSchema,
  ReadFileContentResultSchema,
  normalizeReadFileContentArgs,
} from "@domain/inspection/read-file-content/schema";
import {
  getFindPathsByNameResult,
  handleSearchFiles,
} from "@domain/inspection/find-paths-by-name/handler";
import {
  FindPathsByNameArgsSchema,
  FindPathsByNameResultSchema,
} from "@domain/inspection/find-paths-by-name/schema";
import {
  getFindFilesByGlobResult,
  handleSearchGlob,
} from "@domain/inspection/find-files-by-glob/handler";
import {
  FindFilesByGlobArgsSchema,
  FindFilesByGlobResultSchema,
} from "@domain/inspection/find-files-by-glob/schema";
import { buildSearchRegexToolResult } from "@domain/inspection/search/search-file-contents-by-regex/handler";
import {
  SearchFileContentsByRegexBaseArgsSchema,
  SearchFileContentsByRegexResultSchema,
} from "@domain/inspection/search/search-file-contents-by-regex/schema";
import { buildSearchFixedStringToolResult } from "@domain/inspection/search/search-file-contents-by-fixed-string/handler";
import {
  SearchFileContentsByFixedStringBaseArgsSchema,
  SearchFileContentsByFixedStringResultSchema,
} from "@domain/inspection/search/search-file-contents-by-fixed-string/schema";
import {
  formatCountLinesResultOutput,
  getCountLinesResult,
} from "@domain/inspection/count-lines/handler";
import {
  CountLinesArgsSchema,
  CountLinesResultSchema,
} from "@domain/inspection/count-lines/schema";
import {
  getFileChecksumsResult,
  handleChecksumFiles,
} from "@domain/inspection/get-file-checksums/handler";
import {
  GetFileChecksumsArgsSchema,
  GetFileChecksumsResultSchema,
} from "@domain/inspection/get-file-checksums/schema";
import {
  getFileChecksumVerificationResult,
  handleChecksumFilesVerif,
} from "@domain/inspection/verify-file-checksums/handler";
import {
  VerifyFileChecksumsArgsSchema,
  VerifyFileChecksumsResultSchema,
} from "@domain/inspection/verify-file-checksums/schema";

import type { RegisterToolCatalogContext } from "./register-tool-catalog";
import {
  buildCountLinesToolDescription,
  buildFindFilesByGlobToolDescription,
  buildFindPathsByNameToolDescription,
  buildGetFileChecksumsToolDescription,
  buildGetPathMetadataToolDescription,
  buildListDirectoryEntriesToolDescription,
  buildReadFileContentToolDescription,
  buildReadFilesWithLineNumbersToolDescription,
  buildSearchFileContentsByFixedStringToolDescription,
  buildSearchFileContentsByRegexToolDescription,
  buildVerifyFileChecksumsToolDescription,
  READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
} from "./tool-registration-presets";

const STRUCTURED_CONTINUATION_AUTHORITY_DESCRIPTION =
  "When additive `admission` and `resume` metadata are returned, `structuredContent.admission` and `structuredContent.resume` remain the authoritative machine-readable envelope, while primary result data remains complete in `content.text` and any mirrored structured result data must not replace it.";

const TOKEN_ONLY_RESUME_DESCRIPTION =
  "Resume only when `structuredContent.resume.resumable` is true and a non-null `resumeToken` is present, using the same endpoint and only that token plus the desired `resumeMode`.";

const FINAL_PREVIEW_FIRST_DESCRIPTION =
  "A preview-first response may finalize without an active resume token only when the current bounded final payload is already present in `content.text` and mirrored in `structuredContent`, and no further resume step exists.";

const EXTERNAL_CONSUMER_BOUNDARY_DESCRIPTION =
  "Consumers that expose only `content.text` while dropping `structuredContent` are outside this server-owned contract and may lose machine-readable envelope metadata or mirrored structured fields, even though primary result data remains available in `content.text`.";

const LIST_DIRECTORY_ENTRIES_TEXT_SURFACING_DESCRIPTION =
  "For `list_directory_entries`, preview-first responses may surface the current bounded directory-entry chunk in `content.text` and may append the active `resumeToken` plus continuation guidance afterward so text-only consumers keep a usable same-endpoint continuation path, while `structuredContent` mirrors the same primary data and carries the authoritative machine-readable envelope.";

/**
 * Registers only the inspection tool family on the application-layer MCP server shell.
 *
 * @remarks
 * The visible inspection contract must guide callers toward narrower requests without implying that
 * hard caps are optional. Tool descriptions therefore summarize schema caps, metadata-first
 * preflights, and runtime refusal behavior qualitatively while leaving numeric ownership in the
 * shared guardrail modules.
 */
export function registerInspectionToolCatalog(context: RegisterToolCatalogContext): void {
  const {
    server,
    allowedDirectories,
    executeTool,
    inspectionResumeSessionStore,
  } = context;

  server.registerTool(
    "read_files_with_line_numbers",
    {
      title: "Read files with line numbers",
      description:
        buildReadFilesWithLineNumbersToolDescription(),
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: ReadFilesWithLineNumbersArgsSchema,
    },
    async ({ paths }) =>
      executeTool("read_files_with_line_numbers", () => handleReadFiles(paths, allowedDirectories)),
  );

  server.registerTool(
    "read_file_content",
    {
      title: "Read file content",
      description:
        buildReadFileContentToolDescription(),
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: ReadFileContentFlatArgsSchema,
      outputSchema: ReadFileContentResultSchema,
    },
    async (args) =>
      executeTool("read_file_content", async () => {
        const normalizedArgs = normalizeReadFileContentArgs(args);
        const result = await getReadFileContentResult(normalizedArgs, allowedDirectories);
        const text = await handleReadFileContent(normalizedArgs, allowedDirectories);

        return {
          content: [{ type: "text", text }],
          structuredContent: result,
        };
      }),
  );

  server.registerTool(
    "list_directory_entries",
    {
      title: "List directory entries",
      description: buildListDirectoryEntriesToolDescription(
        STRUCTURED_CONTINUATION_AUTHORITY_DESCRIPTION,
        LIST_DIRECTORY_ENTRIES_TEXT_SURFACING_DESCRIPTION,
        FINAL_PREVIEW_FIRST_DESCRIPTION,
        EXTERNAL_CONSUMER_BOUNDARY_DESCRIPTION,
      ),
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: ListDirectoryEntriesArgsSchema,
      outputSchema: ListDirectoryEntriesStructuredResultSchema,
    },
    async ({ resumeToken, resumeMode, roots, recursive, metadata, excludeGlobs, respectGitIgnore, includeExcludedGlobs }) =>
      executeTool("list_directory_entries", async () => {
        const result = await getListDirectoryEntriesResult(
          resumeToken,
          resumeMode,
          roots,
          recursive,
          metadata,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          allowedDirectories,
          inspectionResumeSessionStore,
        );
        const text = await handleListDirectoryEntries(
          resumeToken,
          resumeMode,
          roots,
          recursive,
          metadata,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          allowedDirectories,
          inspectionResumeSessionStore,
        );

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            roots: result.roots,
            admission: result.admission,
            resume: result.resume,
          },
        };
      }),
  );

  server.registerTool(
    "find_paths_by_name",
    {
      title: "Find paths by name",
      description:
        buildFindPathsByNameToolDescription(
          STRUCTURED_CONTINUATION_AUTHORITY_DESCRIPTION,
        ),
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: FindPathsByNameArgsSchema,
      outputSchema: FindPathsByNameResultSchema,
    },
    async ({ resumeToken, resumeMode, roots, nameContains, excludeGlobs, includeExcludedGlobs, respectGitIgnore, maxResults }) =>
      executeTool("find_paths_by_name", async () => {
        const resolvedNameContains = nameContains ?? "";
        const result = await getFindPathsByNameResult(
          resumeToken,
          resumeMode,
          roots,
          resolvedNameContains,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          inspectionResumeSessionStore,
          allowedDirectories,
          maxResults,
        );
        const text = await handleSearchFiles(
          resumeToken,
          resumeMode,
          roots,
          resolvedNameContains,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          inspectionResumeSessionStore,
          allowedDirectories,
          maxResults,
        );

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            roots: result.roots,
            totalMatches: result.totalMatches,
            truncated: result.truncated,
            admission: result.admission,
            resume: result.resume,
          },
        };
      }),
  );

  server.registerTool(
    "find_files_by_glob",
    {
      title: "Find files by glob",
      description:
        buildFindFilesByGlobToolDescription(
          STRUCTURED_CONTINUATION_AUTHORITY_DESCRIPTION,
        ),
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: FindFilesByGlobArgsSchema,
      outputSchema: FindFilesByGlobResultSchema,
    },
    async ({ resumeToken, resumeMode, roots, glob, excludeGlobs, includeExcludedGlobs, respectGitIgnore, maxResults }) =>
      executeTool("find_files_by_glob", async () => {
        const resolvedGlob = glob ?? "";
        const result = await getFindFilesByGlobResult(
          resumeToken,
          resumeMode,
          roots,
          resolvedGlob,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          maxResults,
          allowedDirectories,
          inspectionResumeSessionStore,
        );
        const text = await handleSearchGlob(
          resumeToken,
          resumeMode,
          roots,
          resolvedGlob,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          maxResults,
          allowedDirectories,
          inspectionResumeSessionStore,
        );

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            roots: result.roots,
            totalMatches: result.totalMatches,
            truncated: result.truncated,
            admission: result.admission,
            resume: result.resume,
          },
        };
      }),
  );

  server.registerTool(
    "search_file_contents_by_regex",
    {
      title: "Search file contents by regex",
      description:
        buildSearchFileContentsByRegexToolDescription(
          STRUCTURED_CONTINUATION_AUTHORITY_DESCRIPTION,
        ),
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: SearchFileContentsByRegexBaseArgsSchema,
      outputSchema: SearchFileContentsByRegexResultSchema,
    },
    async (args) =>
      executeTool("search_file_contents_by_regex", async () => {
        const resumeToken = args.resumeToken;
        const resumeMode = args.resumeMode;
        const roots = "roots" in args ? args.roots : [];
        const regex = "regex" in args ? (args.regex ?? "") : "";
        const includeGlobs = "includeGlobs" in args ? args.includeGlobs : [];
        const excludeGlobs = "excludeGlobs" in args ? args.excludeGlobs : [];
        const includeExcludedGlobs = "includeExcludedGlobs" in args ? args.includeExcludedGlobs : [];
        const respectGitIgnore = "respectGitIgnore" in args ? args.respectGitIgnore : false;
        const maxResults = "maxResults" in args ? args.maxResults : 100;
        const caseSensitive = "caseSensitive" in args ? args.caseSensitive : false;

        const { text, result } = await buildSearchRegexToolResult({
          resumeToken,
          resumeMode,
          searchPaths: roots,
          pattern: regex,
          filePatterns: includeGlobs,
          excludePatterns: excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          maxResults,
          caseSensitive,
          allowedDirectories,
          inspectionResumeSessionStore,
        });

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            roots: result.roots,
            totalLocations: result.totalLocations,
            totalMatches: result.totalMatches,
            truncated: result.truncated,
            admission: result.admission,
            resume: result.resume,
          },
        };
      }),
  );

  server.registerTool(
    "search_file_contents_by_fixed_string",
    {
      title: "Search file contents by fixed string",
      description: buildSearchFileContentsByFixedStringToolDescription(
        STRUCTURED_CONTINUATION_AUTHORITY_DESCRIPTION,
      ),
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: SearchFileContentsByFixedStringBaseArgsSchema,
      outputSchema: SearchFileContentsByFixedStringResultSchema,
    },
    async (args) =>
      executeTool("search_file_contents_by_fixed_string", async () => {
        const resumeToken = args.resumeToken;
        const resumeMode = args.resumeMode;
        const roots = "roots" in args ? args.roots : [];
        const fixedString = "fixedString" in args ? (args.fixedString ?? "") : "";
        const includeGlobs = "includeGlobs" in args ? args.includeGlobs : [];
        const excludeGlobs = "excludeGlobs" in args ? args.excludeGlobs : [];
        const includeExcludedGlobs = "includeExcludedGlobs" in args ? args.includeExcludedGlobs : [];
        const respectGitIgnore = "respectGitIgnore" in args ? args.respectGitIgnore : false;
        const maxResults = "maxResults" in args ? args.maxResults : 100;
        const caseSensitive = "caseSensitive" in args ? args.caseSensitive : false;

        const { text, result } = await buildSearchFixedStringToolResult({
          resumeToken,
          resumeMode,
          searchPaths: roots,
          fixedString,
          filePatterns: includeGlobs,
          excludePatterns: excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          maxResults,
          caseSensitive,
          allowedDirectories,
          inspectionResumeSessionStore,
        });

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            roots: result.roots,
            totalLocations: result.totalLocations,
            totalMatches: result.totalMatches,
            truncated: result.truncated,
            admission: result.admission,
            resume: result.resume,
          },
        };
      }),
  );

  server.registerTool(
    "count_lines",
    {
      title: "Count lines",
      description:
        buildCountLinesToolDescription(
          STRUCTURED_CONTINUATION_AUTHORITY_DESCRIPTION,
        ),
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: CountLinesArgsSchema,
      outputSchema: CountLinesResultSchema,
    },
    async ({ resumeToken, resumeMode, paths, recursive, regex, includeGlobs, excludeGlobs, includeExcludedGlobs, respectGitIgnore, ignoreEmptyLines }) =>
      executeTool("count_lines", async () => {
        const result = await getCountLinesResult(
          resumeToken,
          resumeMode,
          paths,
          recursive,
          regex,
          includeGlobs,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          ignoreEmptyLines,
          inspectionResumeSessionStore,
          allowedDirectories,
        );
        const text = formatCountLinesResultOutput(result, regex);

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            paths: result.paths,
            totalFiles: result.totalFiles,
            totalLines: result.totalLines,
            totalMatchingLines: result.totalMatchingLines,
            admission: result.admission,
            resume: result.resume,
          },
        };
      }),
  );

  server.registerTool(
    "get_file_checksums",
    {
      title: "Get file checksums",
      description:
        buildGetFileChecksumsToolDescription(),
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: GetFileChecksumsArgsSchema,
      outputSchema: GetFileChecksumsResultSchema,
    },
    async ({ paths, algorithm }) =>
      executeTool("get_file_checksums", async () => {
        const result = await getFileChecksumsResult(paths, algorithm, allowedDirectories);
        const text = await handleChecksumFiles(paths, algorithm, allowedDirectories);

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            entries: result.entries,
            errors: result.errors,
          },
        };
      }),
  );

  server.registerTool(
    "verify_file_checksums",
    {
      title: "Verify file checksums",
      description:
        buildVerifyFileChecksumsToolDescription(),
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: VerifyFileChecksumsArgsSchema,
      outputSchema: VerifyFileChecksumsResultSchema,
    },
    async ({ files, algorithm }) =>
      executeTool("verify_file_checksums", async () => {
        const result = await getFileChecksumVerificationResult(
          files,
          algorithm,
          allowedDirectories,
        );
        const text = await handleChecksumFilesVerif(files, algorithm, allowedDirectories);

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            entries: result.entries,
            errors: result.errors,
            summary: result.summary,
          },
        };
      }),
  );

  server.registerTool(
    "get_path_metadata",
    {
      title: "Get path metadata",
      description:
        buildGetPathMetadataToolDescription(),
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: GetPathMetadataArgsSchema,
      outputSchema: GetPathMetadataResultSchema,
    },
    async ({ paths, metadata }) =>
      executeTool("get_path_metadata", async () => {
        const result = await getPathMetadataResult(paths, metadata, allowedDirectories);
        const text = await handleGetPathMetadata(paths, metadata, allowedDirectories);

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            entries: result.entries,
            errors: result.errors,
          },
        };
      }),
  );
}
