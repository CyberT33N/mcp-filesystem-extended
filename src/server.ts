import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  SetLevelRequestSchema,
  type CallToolResult,
  type LoggingMessageNotification,
} from "@modelcontextprotocol/sdk/types.js";

// Import all schemas
import { ReadFilesArgsSchema } from "./batch_read_files/schema.js";
import { WriteNewFilesArgsSchema } from "./write_new_files/schema.js";
import { AppendFilesArgsSchema } from "./append_files/schema.js";
import { PatchFilesArgsSchema } from "./patch_files/schema.js";
import { FileDiffArgsSchema } from "./file_diffs/schema.js";
import { ContentDiffArgsSchema } from "./content_diffs/schema.js";
import { DeleteFilesArgsSchema } from "./delete_files/schema.js";
import { CopyFileArgsSchema } from "./copy_files/schema.js";
import { MoveFilesArgsSchema } from "./move_files/schema.js";
import { CreateDirectoriesArgsSchema } from "./create_directories/schema.js";
import { ListDirectoryEntriesArgsSchema } from "./list-directory-entries/schema.js";
import { SearchFilesArgsSchema } from "./search_files/schema.js";
import { SearchRegexArgsSchema } from "./search_regexes/schema.js";
import { SearchGlobArgsSchema } from "./search_globs/schema.js";
import { CountLinesArgsSchema } from "./count_lines/schema.js";
import { ChecksumFilesArgsSchema } from "./checksum_files/schema.js";
import { ChecksumFilesVerifArgsSchema } from "./checksum_files_verif/schema.js";
import { GetFileInfoArgsSchema } from "./file_infos/schema.js";

// Import all handlers
import { handleReadFiles } from "./batch_read_files/handler.js";
import { handleWriteNewFiles } from "./write_new_files/handler.js";
import { handleAppendFiles } from "./append_files/handler.js";
import { handlePatchFiles } from "./patch_files/handler.js";
import { handleFileDiff } from "./file_diffs/handler.js";
import { handleContentDiff } from "./content_diffs/handler.js";
import { handleDeleteFiles } from "./delete_files/handler.js";
import { handleCopyFile } from "./copy_files/handler.js";
import { handleMoveFiles } from "./move_files/handler.js";
import { handleCreateDirectories } from "./create_directories/handler.js";
import { handleListDirectoryEntries } from "./list-directory-entries/handler.js";
import { handleSearchFiles } from "./search_files/handler.js";
import { handleSearchRegex } from "./search_regexes/handler.js";
import { handleSearchGlob } from "./search_globs/handler.js";
import { handleCountLines } from "./count_lines/handler.js";
import { handleChecksumFiles } from "./checksum_files/handler.js";
import { handleChecksumFilesVerif } from "./checksum_files_verif/handler.js";
import { handleGetFileInfo } from "./file_infos/handler.js";
type LoggingLevel = LoggingMessageNotification["params"]["level"];

const LogLevelMap: Record<LoggingLevel, number> = {
  emergency: 0,
  alert: 1,
  critical: 2,
  error: 3,
  warning: 4,
  notice: 5,
  info: 6,
  debug: 7,
};

export class FilesystemServer {
  private readonly server: McpServer;
  private readonly allowedDirectories: string[];
  private rootLogLevel: LoggingLevel = "info";

  constructor(allowedDirectories: string[]) {
    this.allowedDirectories = allowedDirectories;

    this.server = new McpServer(
      {
        name: "mcp-filesystem-extended",
        version: "0.6.2",
      },
      {
        capabilities: {
          logging: {},
        },
      },
    );

    this.setupRequestHandlers();
    this.registerTools();
  }

  private shouldLog(level: LoggingLevel): boolean {
    return LogLevelMap[level] <= LogLevelMap[this.rootLogLevel];
  }

  private async log(level: LoggingLevel, logger: string, data: Record<string, unknown>) {
    try {
      if (!this.shouldLog(level)) return;
      await this.server.sendLoggingMessage({ level, logger, data });
    } catch {
      // Never throw from logging path
    }
  }

  private setupRequestHandlers() {
    this.server.server.setRequestHandler(SetLevelRequestSchema, async (request) => {
      this.rootLogLevel = request.params.level;
      await this.log("debug", "logging", {
        message: `Root log level set to '${request.params.level}'`,
      });
      return {};
    });
  }

  private registerTools() {
    this.server.registerTool(
      "batch_read_files",
      {
        description:
          "Read multiple files simultaneously. Works on a single file too. " +
          'Failed reads will not stop the entire operation. Each line is prefixed with its line number (format: "1: line content"). ' +
          "Each file's content is returned with its path as a reference. " +
          "Only works within allowed directories.",
        inputSchema: ReadFilesArgsSchema,
      },
      async ({ paths }) =>
        this.executeTool("batch_read_files", () =>
          handleReadFiles(paths, this.allowedDirectories),
        ),
    );

    this.server.registerTool(
      "write_new_files",
      {
        description:
          "Create multiple new files in a single operation. Works on a single file too. " +
          "Fails if any file already exists. Use patch_files to modify existing files. " +
          "Handles text content with UTF-8 encoding. " +
          "Partial failures will not stop the entire operation. " +
          "Only works within allowed directories.",
        inputSchema: WriteNewFilesArgsSchema,
      },
      async ({ files }) =>
        this.executeTool("write_new_files", () =>
          handleWriteNewFiles(files, this.allowedDirectories),
        ),
    );

    this.server.registerTool(
      "append_files",
      {
        description:
          "Append content to multiple existing files without overwriting. Works on a single file too. " +
          "Creates files if they do not exist. " +
          "Handles text content with UTF-8 encoding. " +
          "Partial failures will not stop the entire operation. " +
          "Only works within allowed directories.",
        inputSchema: AppendFilesArgsSchema,
      },
      async ({ files }) =>
        this.executeTool("append_files", () =>
          handleAppendFiles(files, this.allowedDirectories),
        ),
    );

    this.server.registerTool(
      "delete_files",
      {
        description:
          "Delete multiple files or directories in a single operation. Works on a single file too. " +
          "Set recursive flag to true to delete directories with contents. " +
          "Partial failures will not stop the entire operation. " +
          "Use with caution as operation is permanent. " +
          "Only works within allowed directories.",
        inputSchema: DeleteFilesArgsSchema,
      },
      async ({ paths, recursive }) =>
        this.executeTool("delete_files", () =>
          handleDeleteFiles(paths, recursive, this.allowedDirectories),
        ),
    );

    this.server.registerTool(
      "copy_files",
      {
        description:
          "Copy files or directories through one or more copy operations. Works with a single item too. " +
          "Pass one item for a single copy or multiple items for batch copying on the same endpoint. " +
          "Recursive and overwrite behavior is configured per operation item. " +
          "Both source and destination must be within allowed directories.",
        inputSchema: CopyFileArgsSchema,
      },
      async ({ items }) =>
        this.executeTool("copy_files", () =>
          handleCopyFile(items, this.allowedDirectories),
        ),
    );

    this.server.registerTool(
      "file_diffs",
      {
        description:
          "Compare contents of one or more file pairs and show differences. Works with a single pair too. " +
          "Pass one pair for a single diff or multiple pairs for batch diff generation on the same endpoint. " +
          "Returns a unified diff for each requested pair. " +
          "Only works within allowed directories.",
        inputSchema: FileDiffArgsSchema,
      },
      async ({ items }) =>
        this.executeTool("file_diffs", () =>
          handleFileDiff(items, this.allowedDirectories),
        ),
    );

    this.server.registerTool(
      "content_diffs",
      {
        description:
          "Compare one or more text-content pairs and show differences. Works with a single pair too. " +
          "Pass one pair for a single diff or multiple pairs for batch diff generation on the same endpoint. " +
          "Useful for comparing snippets without saving them to disk. " +
          "Custom labels can be provided per content pair.",
        inputSchema: ContentDiffArgsSchema,
      },
      async ({ items }) =>
        this.executeTool("content_diffs", () => handleContentDiff(items)),
    );

    this.server.registerTool(
      "patch_files",
      {
        description:
          "Patch multiple files simultaneously using line numbers. Works on a single file too. " +
          "Specify line ranges to replace without needing to provide the old text. " +
          "Can handle different patches for each file. " +
          "Shows git-style diffs for all changes. " +
          "Partial failures will not stop the entire operation. " +
          "Only works within allowed directories.",
        inputSchema: PatchFilesArgsSchema,
      },
      async ({ files, dryRun, options }) =>
        this.executeTool("patch_files", () =>
          handlePatchFiles(
            files,
            dryRun,
            { preserveIndentation: options?.preserveIndentation ?? true },
            this.allowedDirectories,
          ),
        ),
    );

    this.server.registerTool(
      "create_directories",
      {
        description:
          "Create multiple directory paths in one operation. Works on a single directory too. " +
          "Creates parent directories if needed. " +
          "Succeeds silently if directories exist. " +
          "Partial failures will not stop the entire operation. " +
          "Only works within allowed directories.",
        inputSchema: CreateDirectoriesArgsSchema,
      },
      async ({ paths }) =>
        this.executeTool("create_directories", () =>
          handleCreateDirectories(paths, this.allowedDirectories),
        ),
    );

    this.server.registerTool(
      "list_directory_entries",
      {
        description:
          "List files and directories for one or more directory roots as TOON-encoded structured entries. Works with a single path too. " +
          "Pass one path for a single listing root or multiple paths for batch listing roots on the same endpoint. " +
          "Recursive traversal is enabled by default and returns nested files and directories. " +
          "Set recursive to false to return only same-level files and directories for each requested root. " +
          "The required type field is always included. Set includeMetadata to true to include additional metadata from the canonical file_infos surface. " +
          "Supports exclude patterns with glob format. Only works within allowed directories.",
        inputSchema: ListDirectoryEntriesArgsSchema,
      },
      async ({
        paths,
        recursive,
        includeMetadata,
        excludePatterns,
      }) =>
        this.executeTool("list_directory_entries", () =>
          handleListDirectoryEntries(
            paths,
            recursive,
            includeMetadata,
            excludePatterns,
            this.allowedDirectories,
          ),
        ),
    );

    this.server.registerTool(
      "move_files",
      {
        description:
          "Move or rename multiple files and directories in a single operation. Works on a single file too. " +
          "By default fails if any destination exists, use overwrite flag to force. " +
          "Creates parent directories of destinations if needed. " +
          "Partial failures will not stop the entire operation. " +
          "All sources and destinations must be within allowed directories.",
        inputSchema: MoveFilesArgsSchema,
      },
      async ({ items, overwrite }) =>
        this.executeTool("move_files", () =>
          handleMoveFiles(items, overwrite, this.allowedDirectories),
        ),
    );

    this.server.registerTool(
      "search_files",
      {
        description:
          "Recursively search one or more root paths for files/directories. Works with a single root path too. " +
          "Case-insensitive matching. Supports exclude patterns with glob format. " +
          "Returns full paths to matches for each requested root path. " +
          "Only searches within allowed directories.",
        inputSchema: SearchFilesArgsSchema,
      },
      async ({ paths, pattern, excludePatterns }) =>
        this.executeTool("search_files", () =>
          handleSearchFiles(
            paths,
            pattern,
            excludePatterns,
            this.allowedDirectories,
          ),
        ),
    );

    this.server.registerTool(
      "search_regexes",
      {
        description:
          "Search file contents with regular expressions across one or more root paths. Works with a single root path too. " +
          "Recursively searches all files in each specified root path, supports filtering files by patterns, and returns matching lines with line numbers and context. " +
          "Only searches within allowed directories.",
        inputSchema: SearchRegexArgsSchema,
      },
      async ({
        paths,
        pattern,
        filePatterns,
        excludePatterns,
        maxResults,
        caseSensitive,
      }) =>
        this.executeTool("search_regexes", () =>
          handleSearchRegex(
            paths,
            pattern,
            filePatterns,
            excludePatterns,
            maxResults,
            caseSensitive,
            this.allowedDirectories,
          ),
        ),
    );

    this.server.registerTool(
      "search_globs",
      {
        description:
          "Find files using glob patterns across one or more root paths. Works with a single root path too. " +
          "Supports powerful patterns like '**/*.js' or 'src/**/*.{ts,tsx}', allows exclude filters, and returns full paths to matching files for each requested root path. " +
          "Only searches within allowed directories.",
        inputSchema: SearchGlobArgsSchema,
      },
      async ({ paths, pattern, excludePatterns, maxResults }) =>
        this.executeTool("search_globs", () =>
          handleSearchGlob(
            paths,
            pattern,
            excludePatterns,
            maxResults,
            this.allowedDirectories,
          ),
        ),
    );

    this.server.registerTool(
      "count_lines",
      {
        description:
          "Count lines for one or more file or directory paths. Works with a single path too. " +
          "Can recursively count lines in multiple files, filter lines with regex patterns, and skip empty lines. " +
          "Returns counts by file and totals for each requested path scope. " +
          "Only works within allowed directories.",
        inputSchema: CountLinesArgsSchema,
      },
      async ({
        paths,
        recursive,
        pattern,
        filePattern,
        excludePatterns,
        ignoreEmptyLines,
      }) =>
        this.executeTool("count_lines", () =>
          handleCountLines(
            paths,
            recursive,
            pattern,
            filePattern,
            excludePatterns,
            ignoreEmptyLines,
            this.allowedDirectories,
          ),
        ),
    );

    this.server.registerTool(
      "checksum_files",
      {
        description:
          "Generate checksums for multiple files. Works on a single file too. " +
          "Supports md5, sha1, sha256, and sha512 algorithms. " +
          "Returns hashes for all files in a consistent format. " +
          "Only works within allowed directories.",
        inputSchema: ChecksumFilesArgsSchema,
      },
      async ({ paths, algorithm }) =>
        this.executeTool("checksum_files", () =>
          handleChecksumFiles(paths, algorithm, this.allowedDirectories),
        ),
    );

    this.server.registerTool(
      "checksum_files_verif",
      {
        description:
          "Verify multiple files against expected checksums. Works on a single file too. " +
          "Supports md5, sha1, sha256, and sha512 algorithms. " +
          "Returns verification results for all files. " +
          "Only works within allowed directories.",
        inputSchema: ChecksumFilesVerifArgsSchema,
      },
      async ({ files, algorithm }) =>
        this.executeTool("checksum_files_verif", () =>
          handleChecksumFilesVerif(
            files,
            algorithm,
            this.allowedDirectories,
          ),
        ),
    );

    this.server.registerTool(
      "get_file_infos",
      {
        description:
          "Get detailed file or directory metadata for one or more paths. Works with a single path too. " +
          "Returns size, creation time, modified time, access time, type, and permissions for each requested path. " +
          "Only works within allowed directories.",
        inputSchema: GetFileInfoArgsSchema,
      },
      async ({ paths }) =>
        this.executeTool("get_file_infos", () =>
          handleGetFileInfo(paths, this.allowedDirectories),
        ),
    );

    this.server.registerTool(
      "list_allowed_directories",
      {
        description:
          "List all directories the server is allowed to access. " +
          "No input required. " +
          "Returns directories that this server can read/write from.",
      },
      async () => ({
        content: [
          {
            type: "text",
            text: `Allowed directories:\n${this.allowedDirectories.join("\n")}`,
          },
        ],
      }),
    );
  }

  private async executeTool(
    name: string,
    action: () => Promise<string>,
  ): Promise<CallToolResult> {
    try {
      await this.log("info", "tools", { event: "call", tool: name });
      const result = await action();
      await this.log("info", "tools", { event: "result", tool: name });

      return {
        content: [{ type: "text", text: result }],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.log("error", "tools", {
        event: "error",
        tool: name,
        error: errorMessage,
      });

      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  }

  async connect() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("MCP Filesystem Extended Server running on stdio");
    console.error("Allowed directories:", this.allowedDirectories);
    await this.log("info", "main", { message: "Server connected via stdio" });
  }
}
