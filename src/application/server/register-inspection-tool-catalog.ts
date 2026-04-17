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
  ReadFileContentArgsSchema,
  ReadFileContentResultSchema,
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
import {
  getSearchRegexResult,
  handleSearchRegex,
} from "@domain/inspection/search-file-contents-by-regex/handler";
import {
  SearchFileContentsByRegexArgsSchema,
  SearchFileContentsByRegexResultSchema,
} from "@domain/inspection/search-file-contents-by-regex/schema";
import {
  getSearchFixedStringResult,
  handleSearchFixedString,
} from "@domain/inspection/search-file-contents-by-fixed-string/handler";
import {
  SearchFileContentsByFixedStringArgsSchema,
  SearchFileContentsByFixedStringResultSchema,
} from "@domain/inspection/search-file-contents-by-fixed-string/schema";
import {
  getCountLinesResult,
  handleCountLines,
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
import { READ_ONLY_LOCAL_TOOL_ANNOTATIONS } from "./tool-registration-presets";

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
  const { server, allowedDirectories, executeTool } = context;

  server.registerTool(
    "read_files_with_line_numbers",
    {
      title: "Read files with line numbers",
      description:
        "Reads one or more text files and returns line-numbered content blocks. " +
        "Use this tool for direct file reading, not for metadata lookup or content search. " +
        "Projected oversized reads are refused by server-side safety caps, so reduce file count or narrow scope for constrained results.",
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
        "Reads one text file through explicit full, line-range, byte-range, or chunk-cursor modes while large-file access stays bounded by shared runtime policy and response budgets. " +
        "Use this tool for single-file content access, not for metadata lookup, multi-file batch reads, or content search. " +
        "Oversized inline full reads are refused, so switch to range or cursor modes for larger files.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: ReadFileContentArgsSchema,
      outputSchema: ReadFileContentResultSchema,
    },
    async (args) =>
      executeTool("read_file_content", async () => {
        const result = await getReadFileContentResult(args, allowedDirectories);
        const text = await handleReadFileContent(args, allowedDirectories);

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
      description:
        "Lists structured directory entries for one or more directory roots while broad roots exclude default vendor/cache trees unless callers target them explicitly or reopen descendants with additive overrides such as `includeExcludedGlobs` or optional `.gitignore` enrichment. " +
        "Required `type` and `size` are always included, while grouped timestamp and permission metadata can be requested explicitly. " +
        "Results remain bounded by server safety caps, and overly broad requests may be refused when the projected response would exceed those caps.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: ListDirectoryEntriesArgsSchema,
      outputSchema: ListDirectoryEntriesStructuredResultSchema,
    },
    async ({ roots, recursive, metadata, excludeGlobs, respectGitIgnore, includeExcludedGlobs }) =>
      executeTool("list_directory_entries", async () => {
        const result = await getListDirectoryEntriesResult(
          roots,
          recursive,
          metadata,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          allowedDirectories,
        );
        const text = await handleListDirectoryEntries(
          roots,
          recursive,
          metadata,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          allowedDirectories,
        );

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            roots: result.roots,
          },
        };
      }),
  );

  server.registerTool(
    "find_paths_by_name",
    {
      title: "Find paths by name",
      description:
        "Finds file and directory paths by case-insensitive name substring while broad roots exclude default vendor/cache trees unless callers target them explicitly or reopen descendants with additive overrides such as `includeExcludedGlobs` or optional `.gitignore` enrichment. " +
        "Use this tool for path discovery, not for searching file contents. " +
        "Results remain bounded by server safety caps, and overly broad requests may be refused when the projected response would exceed those caps.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: FindPathsByNameArgsSchema,
      outputSchema: FindPathsByNameResultSchema,
    },
    async ({ roots, nameContains, excludeGlobs, includeExcludedGlobs, respectGitIgnore }) =>
      executeTool("find_paths_by_name", async () => {
        const result = await getFindPathsByNameResult(
          roots,
          nameContains,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          allowedDirectories,
        );
        const text = await handleSearchFiles(
          roots,
          nameContains,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          allowedDirectories,
        );

      return {
        content: [{ type: "text", text }],
        structuredContent: {
          roots: result.roots,
          totalMatches: result.totalMatches,
          truncated: result.truncated,
        },
      };
    }),
  );

  server.registerTool(
    "find_files_by_glob",
    {
      title: "Find files by glob",
      description:
        "Finds files by glob pattern under one or more roots while broad roots exclude default vendor/cache trees unless callers target them explicitly or reopen descendants with additive overrides such as `includeExcludedGlobs` or optional `.gitignore` enrichment. " +
        "Use this tool when the selection is expressed in glob syntax rather than plain name matching or regex content search. " +
        "Results remain bounded by server safety caps, and overly broad requests may be refused when the projected response would exceed those caps.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: FindFilesByGlobArgsSchema,
      outputSchema: FindFilesByGlobResultSchema,
    },
    async ({ roots, glob, excludeGlobs, includeExcludedGlobs, respectGitIgnore, maxResults }) =>
      executeTool("find_files_by_glob", async () => {
        const result = await getFindFilesByGlobResult(
          roots,
          glob,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          maxResults,
          allowedDirectories,
        );
        const text = await handleSearchGlob(
          roots,
          glob,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          maxResults,
          allowedDirectories,
        );

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            roots: result.roots,
            totalMatches: result.totalMatches,
            truncated: result.truncated,
          },
        };
      }),
  );

  server.registerTool(
    "search_file_contents_by_regex",
    {
      title: "Search file contents by regex",
      description:
        "Searches text file contents with a regular expression while broad roots exclude default vendor/cache trees unless callers target them explicitly or reopen descendants with additive overrides such as `includeExcludedGlobs` or optional `.gitignore` enrichment. " +
        "Use this tool for content matching, not for file-name or glob matching. " +
        "Structurally unsafe patterns and oversized search scopes are refused, so narrow roots, globs, or `maxResults` for constrained searches.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: SearchFileContentsByRegexArgsSchema,
      outputSchema: SearchFileContentsByRegexResultSchema,
    },
    async ({ roots, regex, includeGlobs, excludeGlobs, includeExcludedGlobs, respectGitIgnore, maxResults, caseSensitive }) =>
      executeTool("search_file_contents_by_regex", async () => {
        const result = await getSearchRegexResult(
          roots,
          regex,
          includeGlobs,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          maxResults,
          caseSensitive,
          allowedDirectories,
        );
        const text = await handleSearchRegex(
          roots,
          regex,
          includeGlobs,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          maxResults,
          caseSensitive,
          allowedDirectories,
        );

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            roots: result.roots,
            totalLocations: result.totalLocations,
            totalMatches: result.totalMatches,
            truncated: result.truncated,
          },
        };
      }),
  );

  server.registerTool(
    "search_file_contents_by_fixed_string",
    {
      title: "Search file contents by fixed string",
      description:
        "Searches text file contents with an exact fixed string while broad roots exclude default vendor/cache trees unless callers target them explicitly or reopen descendants with additive overrides such as `includeExcludedGlobs` or optional `.gitignore` enrichment. " +
        "Use this tool for literal content matching, not for regex content matching, file-name matching, or glob matching. " +
        "Structurally oversized search scopes are refused, so narrow roots, globs, or `maxResults` for constrained searches.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: SearchFileContentsByFixedStringArgsSchema,
      outputSchema: SearchFileContentsByFixedStringResultSchema,
    },
    async ({ roots, fixedString, includeGlobs, excludeGlobs, includeExcludedGlobs, respectGitIgnore, maxResults, caseSensitive }) =>
      executeTool("search_file_contents_by_fixed_string", async () => {
        const result = await getSearchFixedStringResult(
          roots,
          fixedString,
          includeGlobs,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          maxResults,
          caseSensitive,
          allowedDirectories,
        );
        const text = await handleSearchFixedString(
          roots,
          fixedString,
          includeGlobs,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          maxResults,
          caseSensitive,
          allowedDirectories,
        );

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            roots: result.roots,
            totalLocations: result.totalLocations,
            totalMatches: result.totalMatches,
            truncated: result.truncated,
          },
        };
      }),
  );

  server.registerTool(
    "count_lines",
    {
      title: "Count lines",
      description:
        "Counts lines in files or traversed directory trees while broad directory roots exclude default vendor/cache trees unless callers target them explicitly or reopen descendants with additive overrides such as `includeExcludedGlobs` or optional `.gitignore` enrichment. " +
        "Use this tool for totals and filtered line counting, not for reading full file content. " +
        "Results remain bounded by server safety caps, and overly broad requests may be refused when the projected response would exceed those caps.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: CountLinesArgsSchema,
      outputSchema: CountLinesResultSchema,
    },
    async ({ paths, recursive, regex, includeGlobs, excludeGlobs, includeExcludedGlobs, respectGitIgnore, ignoreEmptyLines }) =>
      executeTool("count_lines", async () => {
        const result = await getCountLinesResult(
          paths,
          recursive,
          regex,
          includeGlobs[0] ?? "**",
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          ignoreEmptyLines,
          allowedDirectories,
        );
        const text = await handleCountLines(
          paths,
          recursive,
          regex,
          includeGlobs[0] ?? "**",
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          ignoreEmptyLines,
          allowedDirectories,
        );

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            paths: result.paths,
            totalFiles: result.totalFiles,
            totalLines: result.totalLines,
            totalMatchingLines: result.totalMatchingLines,
          },
        };
      }),
  );

  server.registerTool(
    "get_file_checksums",
    {
      title: "Get file checksums",
      description:
        "Generates checksums for one or more files using a selected hash algorithm. " +
        "Use this tool for hash generation, not for verification against expected values. " +
        "Results remain bounded by server safety caps, and oversized multi-file requests may be refused when the projected response would exceed those caps.",
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
        "Verifies one or more files against expected hash values. " +
        "Use this tool when an expected checksum is already known. " +
        "Results remain bounded by server safety caps, and oversized multi-file requests may be refused when the projected response would exceed those caps.",
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
        "Returns structured metadata for one or more files or directories. " +
        "Required `size` and `type` are always included, while grouped timestamp and permission metadata can be requested explicitly. " +
        "Results remain bounded by server safety caps, and oversized multi-path requests may be refused when the projected response would exceed those caps.",
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
