import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  getPathMetadataResult,
  handleGetFileInfo,
} from "@domain/inspection/get-path-metadata/handler.js";
import { GetFileInfoArgsSchema } from "@domain/inspection/get-path-metadata/schema.js";
import {
  getListDirectoryEntriesResult,
  handleListDirectoryEntries,
} from "@domain/inspection/list-directory-entries/handler.js";
import { ListDirectoryEntriesArgsSchema } from "@domain/inspection/list-directory-entries/schema.js";
import { handleReadFiles } from "@domain/inspection/read-files-with-line-numbers/handler.js";
import { ReadFilesArgsSchema } from "@domain/inspection/read-files-with-line-numbers/schema.js";
import {
  getFindPathsByNameResult,
  handleSearchFiles,
} from "@domain/inspection/find-paths-by-name/handler.js";
import { SearchFilesArgsSchema } from "@domain/inspection/find-paths-by-name/schema.js";
import {
  getFindFilesByGlobResult,
  handleSearchGlob,
} from "@domain/inspection/find-files-by-glob/handler.js";
import { SearchGlobArgsSchema } from "@domain/inspection/find-files-by-glob/schema.js";
import {
  getSearchRegexResult,
  handleSearchRegex,
} from "@domain/inspection/search-file-contents-by-regex/handler.js";
import { SearchRegexArgsSchema } from "@domain/inspection/search-file-contents-by-regex/schema.js";
import {
  getCountLinesResult,
  handleCountLines,
} from "@domain/inspection/count-lines/handler.js";
import { CountLinesArgsSchema } from "@domain/inspection/count-lines/schema.js";
import {
  getFileChecksumsResult,
  handleChecksumFiles,
} from "@domain/inspection/get-file-checksums/handler.js";
import { ChecksumFilesArgsSchema } from "@domain/inspection/get-file-checksums/schema.js";
import {
  getFileChecksumVerificationResult,
  handleChecksumFilesVerif,
} from "@domain/inspection/verify-file-checksums/handler.js";
import { ChecksumFilesVerifArgsSchema } from "@domain/inspection/verify-file-checksums/schema.js";
import { handleFileDiff } from "@domain/comparison/diff-files/handler.js";
import { FileDiffArgsSchema } from "@domain/comparison/diff-files/schema.js";
import { handleContentDiff } from "@domain/comparison/diff-text-content/handler.js";
import { ContentDiffArgsSchema } from "@domain/comparison/diff-text-content/schema.js";
import { handleWriteNewFiles } from "@domain/mutation/create-files/handler.js";
import { WriteNewFilesArgsSchema } from "@domain/mutation/create-files/schema.js";
import { handleAppendFiles } from "@domain/mutation/append-files/handler.js";
import { AppendFilesArgsSchema } from "@domain/mutation/append-files/schema.js";
import { handlePatchFiles } from "@domain/mutation/replace-file-line-ranges/handler.js";
import { PatchFilesArgsSchema } from "@domain/mutation/replace-file-line-ranges/schema.js";
import { handleCreateDirectories } from "@domain/mutation/create-directories/handler.js";
import { CreateDirectoriesArgsSchema } from "@domain/mutation/create-directories/schema.js";
import { handleCopyFile } from "@domain/mutation/copy-paths/handler.js";
import { CopyFileArgsSchema } from "@domain/mutation/copy-paths/schema.js";
import { handleMoveFiles } from "@domain/mutation/move-paths/handler.js";
import { MoveFilesArgsSchema } from "@domain/mutation/move-paths/schema.js";
import { handleDeleteFiles } from "@domain/mutation/delete-paths/handler.js";
import { DeleteFilesArgsSchema } from "@domain/mutation/delete-paths/schema.js";

const READ_ONLY_LOCAL_TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const ADDITIVE_LOCAL_TOOL_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
} as const;

const IDEMPOTENT_ADDITIVE_LOCAL_TOOL_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const DESTRUCTIVE_LOCAL_TOOL_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
} as const;

const OPTIONAL_TASK_EXECUTION = {
  taskSupport: "optional",
} as const;

type ListedDirectoryEntryOutput = {
  name: string;
  path: string;
  type: "directory" | "file" | "other";
  children?: ListedDirectoryEntryOutput[] | undefined;
  size?: number | undefined;
  created?: string | undefined;
  modified?: string | undefined;
  accessed?: string | undefined;
  permissions?: string | undefined;
};

type ListDirectoryEntriesStructuredOutput = {
  roots: Array<{
    requestedPath: string;
    entries: ListedDirectoryEntryOutput[];
  }>;
};

type PathMetadataStructuredOutput = {
  entries: Array<{
    path: string;
    type: "directory" | "file" | "other";
    size: number;
    created: string;
    modified: string;
    accessed: string;
    permissions: string;
  }>;
  errors: Array<{
    path: string;
    error: string;
  }>;
};

const LISTED_DIRECTORY_ENTRY_OUTPUT_SCHEMA: z.ZodType<ListedDirectoryEntryOutput> = z.lazy(
  (): z.ZodType<ListedDirectoryEntryOutput> =>
    z.object({
      name: z.string(),
      path: z.string(),
      type: z.enum(["directory", "file", "other"]),
      children: z.array(LISTED_DIRECTORY_ENTRY_OUTPUT_SCHEMA).optional(),
      size: z.number().optional(),
      created: z.string().optional(),
      modified: z.string().optional(),
      accessed: z.string().optional(),
      permissions: z.string().optional(),
    }),
);

const LIST_DIRECTORY_ENTRIES_OUTPUT_SCHEMA: z.ZodType<ListDirectoryEntriesStructuredOutput> = z.object({
  roots: z.array(
    z.object({
      requestedPath: z.string(),
      entries: z.array(LISTED_DIRECTORY_ENTRY_OUTPUT_SCHEMA),
    }),
  ),
});

const PATH_METADATA_OUTPUT_SCHEMA: z.ZodType<PathMetadataStructuredOutput> = z.object({
  entries: z.array(
    z.object({
      path: z.string(),
      type: z.enum(["directory", "file", "other"]),
      size: z.number(),
      created: z.string(),
      modified: z.string(),
      accessed: z.string(),
      permissions: z.string(),
    }),
  ),
  errors: z.array(
    z.object({
      path: z.string(),
      error: z.string(),
    }),
  ),
});

const FILE_CHECKSUMS_OUTPUT_SCHEMA = z.object({
  entries: z.array(
    z.object({
      path: z.string(),
      hash: z.string(),
    }),
  ),
  errors: z.array(
    z.object({
      path: z.string(),
      error: z.string(),
    }),
  ),
});

const FILE_CHECKSUM_VERIFICATION_OUTPUT_SCHEMA = z.object({
  entries: z.array(
    z.object({
      path: z.string(),
      expectedHash: z.string(),
      actualHash: z.string(),
      valid: z.boolean(),
    }),
  ),
  errors: z.array(
    z.object({
      path: z.string(),
      expectedHash: z.string(),
      error: z.string(),
    }),
  ),
  summary: z.object({
    validCount: z.number(),
    invalidCount: z.number(),
    errorCount: z.number(),
  }),
});

const FIND_PATHS_BY_NAME_OUTPUT_SCHEMA = z.object({
  roots: z.array(
    z.object({
      root: z.string(),
      matches: z.array(z.string()),
    }),
  ),
  totalMatches: z.number(),
});

const FIND_FILES_BY_GLOB_OUTPUT_SCHEMA = z.object({
  roots: z.array(
    z.object({
      root: z.string(),
      matches: z.array(z.string()),
      truncated: z.boolean(),
    }),
  ),
  totalMatches: z.number(),
  truncated: z.boolean(),
});

const SEARCH_FILE_CONTENTS_BY_REGEX_OUTPUT_SCHEMA = z.object({
  roots: z.array(
    z.object({
      root: z.string(),
      matches: z.array(
        z.object({
          file: z.string(),
          line: z.number(),
          content: z.string(),
          match: z.string(),
        }),
      ),
      filesSearched: z.number(),
      totalMatches: z.number(),
      truncated: z.boolean(),
    }),
  ),
  totalLocations: z.number(),
  totalMatches: z.number(),
  truncated: z.boolean(),
});

const COUNT_LINES_OUTPUT_SCHEMA = z.object({
  paths: z.array(
    z.object({
      path: z.string(),
      files: z.array(
        z.object({
          file: z.string(),
          count: z.number(),
          matchingCount: z.number().optional(),
        }),
      ),
      totalLines: z.number(),
      totalMatchingLines: z.number(),
    }),
  ),
  totalFiles: z.number(),
  totalLines: z.number(),
  totalMatchingLines: z.number(),
});

/**
 * Callback shape used to wrap tool execution in the application-layer server shell.
 */
export type ToolExecutor = (
  toolName: string,
  action: () => Promise<CallToolResult | string>,
) => Promise<CallToolResult>;

/**
 * Inputs required to register the full filesystem tool catalog.
 */
export interface RegisterToolCatalogContext {
  /**
   * MCP server instance that owns the tool surface.
   */
  server: McpServer;

  /**
   * Allowed filesystem roots used by the handler layer.
   */
  allowedDirectories: string[];

  /**
   * Stable application-layer wrapper for logging, result normalization, and error handling.
   */
  executeTool: ToolExecutor;
}

/**
 * Registers the complete filesystem tool catalog on the application-layer MCP server.
 *
 * @param context - Tool-registration dependencies owned by the application server shell.
 * @returns Nothing. The tool surface is registered directly on the provided server instance.
 */
export function registerToolCatalog(context: RegisterToolCatalogContext): void {
  const { server, allowedDirectories, executeTool } = context;

  const readFilesWithLineNumbersTool = server.registerTool(
    "read_files_with_line_numbers",
    {
      title: "Read files with line numbers",
      description:
        "Reads one or more text files and returns line-numbered content blocks. " +
        "Use this tool for direct file reading, not for metadata lookup or content search.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: ReadFilesArgsSchema,
    },
    async ({ paths }) =>
      executeTool("read_files_with_line_numbers", () =>
        handleReadFiles(paths, allowedDirectories),
      ),
  );
  readFilesWithLineNumbersTool.execution = OPTIONAL_TASK_EXECUTION;

  server.registerTool(
    "create_files",
    {
      title: "Create files",
      description:
        "Creates one or more new text files. " +
        "Use this tool only when the target files do not already exist.",
      annotations: ADDITIVE_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: WriteNewFilesArgsSchema,
    },
    async ({ files }) =>
      executeTool("create_files", () => handleWriteNewFiles(files, allowedDirectories)),
  );

  server.registerTool(
    "append_files",
    {
      title: "Append files",
      description:
        "Appends text content to one or more files. " +
        "Use this tool for additive writes at file end, not targeted replacement.",
      annotations: ADDITIVE_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: AppendFilesArgsSchema,
    },
    async ({ files }) =>
      executeTool("append_files", () => handleAppendFiles(files, allowedDirectories)),
  );

  server.registerTool(
    "delete_paths",
    {
      title: "Delete paths",
      description:
        "Deletes files or directories. " +
        "Use this tool only for removal, not for in-place rewrite workflows.",
      annotations: DESTRUCTIVE_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: DeleteFilesArgsSchema,
    },
    async ({ paths, recursive }) =>
      executeTool("delete_paths", () =>
        handleDeleteFiles(paths, recursive, allowedDirectories),
      ),
  );

  server.registerTool(
    "copy_paths",
    {
      title: "Copy paths",
      description:
        "Copies files or directories to new destinations. " +
        "Use this tool when the source should remain in place after the operation.",
      annotations: ADDITIVE_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: CopyFileArgsSchema,
    },
    async ({ operations }) =>
      executeTool("copy_paths", () =>
        handleCopyFile(
          operations.map((operation) => ({
            source: operation.sourcePath,
            destination: operation.destinationPath,
            recursive: operation.recursive,
            overwrite: operation.overwrite,
          })),
          allowedDirectories,
        ),
      ),
  );

  server.registerTool(
    "diff_files",
    {
      title: "Diff files",
      description:
        "Compares the contents of one or more file pairs and returns unified diffs. " +
        "Use this tool when the comparison source is already stored on disk.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: FileDiffArgsSchema,
    },
    async ({ pairs }) =>
      executeTool("diff_files", () =>
        handleFileDiff(
          pairs.map((pair) => ({
            file1: pair.leftPath,
            file2: pair.rightPath,
          })),
          allowedDirectories,
        ),
      ),
  );

  server.registerTool(
    "diff_text_content",
    {
      title: "Diff text content",
      description:
        "Compares one or more in-memory text content pairs and returns unified diffs. " +
        "Use this tool when the compared inputs are provided directly rather than read from files.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: ContentDiffArgsSchema,
    },
    async ({ pairs }) =>
      executeTool("diff_text_content", () =>
        handleContentDiff(
          pairs.map((pair) => ({
            content1: pair.leftContent,
            content2: pair.rightContent,
            label1: pair.leftLabel,
            label2: pair.rightLabel,
          })),
        ),
      ),
  );

  server.registerTool(
    "replace_file_line_ranges",
    {
      title: "Replace file line ranges",
      description:
        "Replaces one or more 1-based inclusive line ranges in existing text files. " +
        "Use this tool for direct line-range replacement, not unified diff patch text.",
      annotations: DESTRUCTIVE_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: PatchFilesArgsSchema,
    },
    async ({ files, dryRun }) =>
      executeTool("replace_file_line_ranges", () =>
        handlePatchFiles(
          files.map((file) => ({
            path: file.path,
            patches: file.replacements.map((replacement) => ({
              startLine: replacement.startLine,
              endLine: replacement.endLine,
              newText: replacement.replacementText,
            })),
          })),
          dryRun,
          { preserveIndentation: true },
          allowedDirectories,
        ),
      ),
  );

  server.registerTool(
    "create_directories",
    {
      title: "Create directories",
      description:
        "Creates one or more directory paths, including missing parent directories. " +
        "Use this tool for directory creation only.",
      annotations: IDEMPOTENT_ADDITIVE_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: CreateDirectoriesArgsSchema,
    },
    async ({ paths }) =>
      executeTool("create_directories", () =>
        handleCreateDirectories(paths, allowedDirectories),
      ),
  );

  const listDirectoryEntriesTool = server.registerTool(
    "list_directory_entries",
    {
      title: "List directory entries",
      description:
        "Lists structured directory entries for one or more directory roots. " +
        "Use this tool for directory topology and optional entry metadata, not for name or content search.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: ListDirectoryEntriesArgsSchema,
      outputSchema: LIST_DIRECTORY_ENTRIES_OUTPUT_SCHEMA,
    },
    async ({ roots, recursive, includeMetadata, excludeGlobs }) =>
      executeTool("list_directory_entries", async () => {
        const directoryEntriesResult = await getListDirectoryEntriesResult(
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
            roots: directoryEntriesResult.roots,
          },
        };
      }),
  );
  listDirectoryEntriesTool.execution = OPTIONAL_TASK_EXECUTION;

  server.registerTool(
    "move_paths",
    {
      title: "Move paths",
      description:
        "Moves or renames files or directories. " +
        "Use this tool when the source should no longer remain at the original path.",
      annotations: DESTRUCTIVE_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: MoveFilesArgsSchema,
    },
    async ({ operations, overwrite }) =>
      executeTool("move_paths", () =>
        handleMoveFiles(
          operations.map((operation) => ({
            source: operation.sourcePath,
            destination: operation.destinationPath,
          })),
          overwrite,
          allowedDirectories,
        ),
      ),
  );

  server.registerTool(
    "find_paths_by_name",
    {
      title: "Find paths by name",
      description:
        "Finds file and directory paths by case-insensitive name substring. " +
        "Use this tool for path discovery, not for searching file contents.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: SearchFilesArgsSchema,
      outputSchema: FIND_PATHS_BY_NAME_OUTPUT_SCHEMA,
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

  const searchFileContentsByRegexTool = server.registerTool(
    "search_file_contents_by_regex",
    {
      title: "Search file contents by regex",
      description:
        "Searches text file contents with a regular expression. " +
        "Use this tool for content matching, not for file-name or glob matching.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: SearchRegexArgsSchema,
      outputSchema: SEARCH_FILE_CONTENTS_BY_REGEX_OUTPUT_SCHEMA,
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

  const findFilesByGlobTool = server.registerTool(
    "find_files_by_glob",
    {
      title: "Find files by glob",
      description:
        "Finds files by glob pattern under one or more roots. " +
        "Use this tool when the selection is expressed in glob syntax rather than plain name matching or regex content search.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: SearchGlobArgsSchema,
      outputSchema: FIND_FILES_BY_GLOB_OUTPUT_SCHEMA,
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

  const countLinesTool = server.registerTool(
    "count_lines",
    {
      title: "Count lines",
      description:
        "Counts lines in files or traversed directory trees. " +
        "Use this tool for totals and filtered line counting, not for reading full file content.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: CountLinesArgsSchema,
      outputSchema: COUNT_LINES_OUTPUT_SCHEMA,
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
      inputSchema: ChecksumFilesArgsSchema,
      outputSchema: FILE_CHECKSUMS_OUTPUT_SCHEMA,
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
      inputSchema: ChecksumFilesVerifArgsSchema,
      outputSchema: FILE_CHECKSUM_VERIFICATION_OUTPUT_SCHEMA,
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
      inputSchema: GetFileInfoArgsSchema,
      outputSchema: PATH_METADATA_OUTPUT_SCHEMA,
    },
    async ({ paths }) =>
      executeTool("get_path_metadata", async () => {
        const pathMetadataResult = await getPathMetadataResult(paths, allowedDirectories);
        const text = await handleGetFileInfo(paths, allowedDirectories);

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            entries: pathMetadataResult.entries,
            errors: pathMetadataResult.errors,
          },
        };
      }),
  );
  getPathMetadataTool.execution = OPTIONAL_TASK_EXECUTION;

  server.registerTool(
    "list_allowed_directories",
    {
      title: "List allowed directories",
      description:
        "Lists the directory roots this MCP server may access. " +
        "Use this tool to discover the effective filesystem scope before other path-based calls.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
    },
    async () => ({
      content: [
        {
          type: "text",
          text: `Allowed directories:\n${allowedDirectories.join("\n")}`,
        },
      ],
    }),
  );
}
