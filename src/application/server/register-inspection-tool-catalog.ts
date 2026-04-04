import {
  getPathMetadataResult,
  handleGetFileInfo,
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
import {
  OPTIONAL_TASK_EXECUTION,
  READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
} from "./tool-registration-presets";

/**
 * Registers only the inspection tool family on the application-layer MCP server shell.
 */
export function registerInspectionToolCatalog(context: RegisterToolCatalogContext): void {
  const { server, allowedDirectories, executeTool } = context;

  const readFilesWithLineNumbersTool = server.registerTool(
    "read_files_with_line_numbers",
    {
      title: "Read files with line numbers",
      description:
        "Reads one or more text files and returns line-numbered content blocks. " +
        "Use this tool for direct file reading, not for metadata lookup or content search.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: ReadFilesWithLineNumbersArgsSchema,
    },
    async ({ paths }) =>
      executeTool("read_files_with_line_numbers", () => handleReadFiles(paths, allowedDirectories)),
  );
  readFilesWithLineNumbersTool.execution = OPTIONAL_TASK_EXECUTION;

  const listDirectoryEntriesTool = server.registerTool(
    "list_directory_entries",
    {
      title: "List directory entries",
      description:
        "Lists structured directory entries for one or more directory roots. " +
        "Use this tool for directory topology and optional entry metadata, not for name or content search.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: ListDirectoryEntriesArgsSchema,
      outputSchema: ListDirectoryEntriesStructuredResultSchema,
    },
    async ({ roots, recursive, includeMetadata, excludeGlobs }) =>
      executeTool("list_directory_entries", async () => {
        const result = await getListDirectoryEntriesResult(
          roots,
          recursive,
          includeMetadata,
          excludeGlobs,
          allowedDirectories,
        );
        const text = await handleListDirectoryEntries(
          roots,
          recursive,
          includeMetadata,
          excludeGlobs,
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
  listDirectoryEntriesTool.execution = OPTIONAL_TASK_EXECUTION;

  server.registerTool(
    "find_paths_by_name",
    {
      title: "Find paths by name",
      description:
        "Finds file and directory paths by case-insensitive name substring. " +
        "Use this tool for path discovery, not for searching file contents.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: FindPathsByNameArgsSchema,
      outputSchema: FindPathsByNameResultSchema,
    },
    async ({ roots, nameContains, excludeGlobs }) =>
      executeTool("find_paths_by_name", async () => {
        const result = await getFindPathsByNameResult(
          roots,
          nameContains,
          excludeGlobs,
          allowedDirectories,
        );
        const text = await handleSearchFiles(
          roots,
          nameContains,
          excludeGlobs,
          allowedDirectories,
        );

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            roots: result.roots,
            totalMatches: result.totalMatches,
          },
        };
      }),
  );

  const findFilesByGlobTool = server.registerTool(
    "find_files_by_glob",
    {
      title: "Find files by glob",
      description:
        "Finds files by glob pattern under one or more roots. " +
        "Use this tool when the selection is expressed in glob syntax rather than plain name matching or regex content search.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: FindFilesByGlobArgsSchema,
      outputSchema: FindFilesByGlobResultSchema,
    },
    async ({ roots, glob, excludeGlobs, maxResults }) =>
      executeTool("find_files_by_glob", async () => {
        const result = await getFindFilesByGlobResult(
          roots,
          glob,
          excludeGlobs,
          maxResults,
          allowedDirectories,
        );
        const text = await handleSearchGlob(
          roots,
          glob,
          excludeGlobs,
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
  findFilesByGlobTool.execution = OPTIONAL_TASK_EXECUTION;

  const searchFileContentsByRegexTool = server.registerTool(
    "search_file_contents_by_regex",
    {
      title: "Search file contents by regex",
      description:
        "Searches text file contents with a regular expression. " +
        "Use this tool for content matching, not for file-name or glob matching.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: SearchFileContentsByRegexArgsSchema,
      outputSchema: SearchFileContentsByRegexResultSchema,
    },
    async ({ roots, regex, includeGlobs, excludeGlobs, maxResults, caseSensitive }) =>
      executeTool("search_file_contents_by_regex", async () => {
        const result = await getSearchRegexResult(
          roots,
          regex,
          includeGlobs,
          excludeGlobs,
          maxResults,
          caseSensitive,
          allowedDirectories,
        );
        const text = await handleSearchRegex(
          roots,
          regex,
          includeGlobs,
          excludeGlobs,
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
  searchFileContentsByRegexTool.execution = OPTIONAL_TASK_EXECUTION;

  const countLinesTool = server.registerTool(
    "count_lines",
    {
      title: "Count lines",
      description:
        "Counts lines in files or traversed directory trees. " +
        "Use this tool for totals and filtered line counting, not for reading full file content.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: CountLinesArgsSchema,
      outputSchema: CountLinesResultSchema,
    },
    async ({ paths, recursive, regex, includeGlobs, excludeGlobs, ignoreEmptyLines }) =>
      executeTool("count_lines", async () => {
        const result = await getCountLinesResult(
          paths,
          recursive,
          regex,
          includeGlobs[0] ?? "**",
          excludeGlobs,
          ignoreEmptyLines,
          allowedDirectories,
        );
        const text = await handleCountLines(
          paths,
          recursive,
          regex,
          includeGlobs[0] ?? "**",
          excludeGlobs,
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
  countLinesTool.execution = OPTIONAL_TASK_EXECUTION;

  const getFileChecksumsTool = server.registerTool(
    "get_file_checksums",
    {
      title: "Get file checksums",
      description:
        "Generates checksums for one or more files using a selected hash algorithm. " +
        "Use this tool for hash generation, not for verification against expected values.",
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
  getFileChecksumsTool.execution = OPTIONAL_TASK_EXECUTION;

  const verifyFileChecksumsTool = server.registerTool(
    "verify_file_checksums",
    {
      title: "Verify file checksums",
      description:
        "Verifies one or more files against expected hash values. " +
        "Use this tool when an expected checksum is already known.",
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
  verifyFileChecksumsTool.execution = OPTIONAL_TASK_EXECUTION;

  const getPathMetadataTool = server.registerTool(
    "get_path_metadata",
    {
      title: "Get path metadata",
      description:
        "Returns structured metadata for one or more files or directories. " +
        "Use this tool for metadata lookup, not for reading file contents.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: GetPathMetadataArgsSchema,
      outputSchema: GetPathMetadataResultSchema,
    },
    async ({ paths }) =>
      executeTool("get_path_metadata", async () => {
        const result = await getPathMetadataResult(paths, allowedDirectories);
        const text = await handleGetFileInfo(paths, allowedDirectories);

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            entries: result.entries,
            errors: result.errors,
          },
        };
      }),
  );
  getPathMetadataTool.execution = OPTIONAL_TASK_EXECUTION;
}
