import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import "./utils/logger.js";

// Import all schemas
import { ReadFilesArgsSchema } from "./batch_read_files/schema.js";
import { WriteNewFilesArgsSchema } from "./write_new_files/schema.js";
import { AppendFilesArgsSchema } from "./append_files/schema.js";
import { PatchFilesArgsSchema } from "./patch_files/schema.js";
import { FileDiffArgsSchema } from "./file_diff/schema.js";
import { ContentDiffArgsSchema } from "./content_diff/schema.js";
import { DeleteFilesArgsSchema } from "./delete_files/schema.js";
import { CopyFileArgsSchema } from "./copy_files/schema.js";
import { MoveFilesArgsSchema } from "./move_files/schema.js";
import { CreateDirectoriesArgsSchema } from "./create_directories/schema.js";
import { ListDirectoryArgsSchema } from "./list_directory/schema.js";
import { DirectoryTreeArgsSchema } from "./directory_tree/schema.js";
import { SearchFilesArgsSchema } from "./search_files/schema.js";
import { SearchRegexArgsSchema } from "./search_regex/schema.js";
import { SearchGlobArgsSchema } from "./search_glob/schema.js";
import { CountLinesArgsSchema } from "./count_lines/schema.js";
import { ChecksumFilesArgsSchema } from "./checksum_files/schema.js";
import { ChecksumFilesVerifArgsSchema } from "./checksum_files_verif/schema.js";
import { GetFileInfoArgsSchema } from "./file_info/schema.js";
import { SetLevelRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// Import all handlers
import { handleReadFiles } from "./batch_read_files/handler.js";
import { handleWriteNewFiles } from "./write_new_files/handler.js";
import { handleAppendFiles } from "./append_files/handler.js";
import { handlePatchFiles } from "./patch_files/handler.js";
import { handleFileDiff } from "./file_diff/handler.js";
import { handleContentDiff } from "./content_diff/handler.js";
import { handleDeleteFiles } from "./delete_files/handler.js";
import { handleCopyFile } from "./copy_files/handler.js";
import { handleMoveFiles } from "./move_files/handler.js";
import { handleCreateDirectories } from "./create_directories/handler.js";
import { handleListDirectory } from "./list_directory/handler.js";
import { handleDirectoryTree } from "./directory_tree/handler.js";
import { handleSearchFiles } from "./search_files/handler.js";
import { handleSearchRegex } from "./search_regex/handler.js";
import { handleSearchGlob } from "./search_glob/handler.js";
import { handleCountLines } from "./count_lines/handler.js";
import { handleChecksumFiles } from "./checksum_files/handler.js";
import { handleChecksumFilesVerif } from "./checksum_files_verif/handler.js";
import { handleGetFileInfo } from "./file_info/handler.js";

const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

type LoggingLevel =
  | "debug"
  | "info"
  | "notice"
  | "warning"
  | "error"
  | "critical"
  | "alert"
  | "emergency";

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
  private server: Server;
  private allowedDirectories: string[];
  private rootLogLevel: LoggingLevel = "info";

  constructor(allowedDirectories: string[]) {
    this.allowedDirectories = allowedDirectories;
    
    this.server = new Server(
      {
        name: "secure-filesystem-server",
        version: "0.2.0",
      },
      {
        capabilities: {
          tools: {},
          logging: {},
        },
      },
    );
    
    this.setupRequestHandlers();
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
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "batch_read_files",
            description:
              "Read multiple files simultaneously. Works on a single file too. " +
              "Failed reads won't stop the entire operation. " +
              "Each line is prefixed with its line number (format: \"1: line content\"). " +
              "Each file's content is returned with its path as a reference. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(ReadFilesArgsSchema) as ToolInput,
          },
          {
            name: "write_new_files",
            description:
              "Create multiple new files in a single operation. Works on a single file too. " +
              "Fails if any file already exists. Use patch_files to modify existing files. " +
              "Handles text content with UTF-8 encoding. " +
              "Partial failures won't stop the entire operation. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(WriteNewFilesArgsSchema) as ToolInput,
          },
          {
            name: "append_files",
            description:
              "Append content to multiple existing files without overwriting. Works on a single file too. " +
              "Creates files if they don't exist. " +
              "Handles text content with UTF-8 encoding. " +
              "Partial failures won't stop the entire operation. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(AppendFilesArgsSchema) as ToolInput,
          },
          {
            name: "delete_files",
            description:
              "Delete multiple files or directories in a single operation. Works on a single file too. " +
              "Set recursive flag to true to delete directories with contents. " +
              "Partial failures won't stop the entire operation. " +
              "Use with caution as operation is permanent. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(DeleteFilesArgsSchema) as ToolInput,
          },
          {
            name: "copy_file",
            description:
              "Copy files or directories. " +
              "Set recursive flag to true to copy directories with contents. " +
              "Set overwrite flag to true to replace existing destinations. " +
              "Both source and destination must be within allowed directories.",
            inputSchema: zodToJsonSchema(CopyFileArgsSchema) as ToolInput,
          },
          {
            name: "file_diff",
            description:
              "Compare contents of two files and show differences. " +
              "Returns a unified diff showing all changes between files. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(FileDiffArgsSchema) as ToolInput,
          },
          {
            name: "content_diff",
            description:
              "Compare two text strings and show differences. " +
              "Returns a unified diff showing all changes between the contents. " +
              "Useful for comparing snippets without saving them to disk. " +
              "Custom labels can be provided for each content.",
            inputSchema: zodToJsonSchema(ContentDiffArgsSchema) as ToolInput,
          },
          {
            name: "patch_files",
            description:
              "Patch multiple files simultaneously using line numbers. Works on a single file too. " +
              "Specify line ranges to replace without needing to provide the old text. " +
              "Can handle different patches for each file. " +
              "Shows git-style diffs for all changes. " +
              "Partial failures won't stop the entire operation. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(PatchFilesArgsSchema) as ToolInput,
          },
          {
            name: "create_directories",
            description:
              "Create multiple directory paths in one operation. Works on a single directory too. " +
              "Creates parent directories if needed. " +
              "Succeeds silently if directories exist. " +
              "Partial failures won't stop the entire operation. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(CreateDirectoriesArgsSchema) as ToolInput,
          },
          {
            name: "list_directory",
            description:
              "List directory contents with [FILE] or [DIR] prefixes. " +
              "Shows all files and directories in the specified path. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(ListDirectoryArgsSchema) as ToolInput,
          },
          {
            name: "directory_tree",
            description:
                "Get a recursive tree view of files and directories as a JSON structure. " +
                "Returns JSON with name, type, and children properties. " +
                "Supports excluding files/directories using glob patterns. " +
                "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(DirectoryTreeArgsSchema) as ToolInput,
          },
          {
            name: "move_files",
            description:
              "Move or rename multiple files and directories in a single operation. Works on a single file too. " +
              "By default fails if any destination exists, use overwrite flag to force. " +
              "Creates parent directories of destinations if needed. " +
              "Partial failures won't stop the entire operation. " +
              "All sources and destinations must be within allowed directories.",
            inputSchema: zodToJsonSchema(MoveFilesArgsSchema) as ToolInput,
          },
          {
            name: "search_files",
            description:
              "Recursively search for files/directories. " +
              "Case-insensitive matching. " +
              "Supports exclude patterns with glob format. " +
              "Returns full paths to matches. " +
              "Only searches within allowed directories.",
            inputSchema: zodToJsonSchema(SearchFilesArgsSchema) as ToolInput,
          },
          {
            name: "search_regex",
            description:
              "Search file contents using regular expressions. " +
              "Recursively searches all files in specified directory. " +
              "Supports filtering files by patterns. " +
              "Returns matching lines with line numbers and context. " +
              "Only searches within allowed directories.",
            inputSchema: zodToJsonSchema(SearchRegexArgsSchema) as ToolInput,
          },
          {
            name: "search_glob",
            description:
              "Find files using glob patterns. " +
              "Supports powerful patterns like '**/*.js' or 'src/**/*.{ts,tsx}'. " +
              "Excludes can be specified to filter results. " +
              "Returns full paths to matching files. " +
              "Only searches within allowed directories.",
            inputSchema: zodToJsonSchema(SearchGlobArgsSchema) as ToolInput,
          },
          {
            name: "count_lines",
            description:
              "Count lines in files with optional pattern matching. " +
              "Can recursively count lines in multiple files. " +
              "Filter lines with regex patterns or skip empty lines. " +
              "Returns counts by file and totals. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(CountLinesArgsSchema) as ToolInput,
          },
          {
            name: "checksum_files",
            description:
              "Generate checksums for multiple files. Works on a single file too. " +
              "Supports md5, sha1, sha256, and sha512 algorithms. " +
              "Returns hashes for all files in a consistent format. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(ChecksumFilesArgsSchema) as ToolInput,
          },
          {
            name: "checksum_files_verif",
            description:
              "Verify multiple files against expected checksums. Works on a single file too. " +
              "Supports md5, sha1, sha256, and sha512 algorithms. " +
              "Returns verification results for all files. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(ChecksumFilesVerifArgsSchema) as ToolInput,
          },
          {
            name: "get_file_info",
            description:
              "Get detailed file/directory metadata. " +
              "Returns size, creation time, modified time, access time, type, and permissions. " +
              "Only works within allowed directories.",
            inputSchema: zodToJsonSchema(GetFileInfoArgsSchema) as ToolInput,
          },
          {
            name: "list_allowed_directories",
            description:
              "List all directories the server is allowed to access. " +
              "No input required. " +
              "Returns directories that this server can read/write from.",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
        ],
      };
    });

    // Handle MCP logging level changes (root logger)
    this.server.setRequestHandler(SetLevelRequestSchema, async (request) => {
      const level = request.params.level as LoggingLevel;
      if (level in LogLevelMap) {
        this.rootLogLevel = level;
        await this.log("debug", "logging", { message: `Root log level set to '${level}'` });
      } else {
        await this.log("warning", "logging", { message: `Invalid log level '${level}' requested` });
      }
      return {};
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;
        await this.log("info", "tools", { event: "call", tool: name });

        switch (name) {

          case "batch_read_files": {
            const parsed = ReadFilesArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for batch_read_files: ${parsed.error}`);
            }
            const result = await handleReadFiles(parsed.data.paths, this.allowedDirectories);
            await this.log("info", "tools", { event: "result", tool: name });
            return {
              content: [{ type: "text", text: result }],
            };
          }

          
          case "write_new_files": {
            const parsed = WriteNewFilesArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for write_new_files: ${parsed.error}`);
            }
            
            const result = await handleWriteNewFiles(parsed.data.files, this.allowedDirectories);
            await this.log("info", "tools", { event: "result", tool: name });
            
            return {
              content: [{ type: "text", text: result }],
            };
          }
          
          
          case "append_files": {
            const parsed = AppendFilesArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for append_files: ${parsed.error}`);
            }
            
            const result = await handleAppendFiles(parsed.data.files, this.allowedDirectories);
            await this.log("info", "tools", { event: "result", tool: name });
            
            return {
              content: [{ type: "text", text: result }],
            };
          }
          
          
          case "delete_files": {
            const parsed = DeleteFilesArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for delete_files: ${parsed.error}`);
            }
            
            const result = await handleDeleteFiles(
              parsed.data.paths,
              parsed.data.recursive,
              this.allowedDirectories
            );
            await this.log("info", "tools", { event: "result", tool: name });
            
            return {
              content: [{ type: "text", text: result }],
            };
          }
          
          case "copy_file": {
            const parsed = CopyFileArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for copy_file: ${parsed.error}`);
            }
            
            const result = await handleCopyFile(
              parsed.data.source,
              parsed.data.destination,
              parsed.data.recursive,
              parsed.data.overwrite,
              this.allowedDirectories
            );
            await this.log("info", "tools", { event: "result", tool: name });
            
            return {
              content: [{ type: "text", text: result }],
            };
          }
          
          case "file_diff": {
            const parsed = FileDiffArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for file_diff: ${parsed.error}`);
            }
            
            const result = await handleFileDiff(
              parsed.data.file1,
              parsed.data.file2,
              this.allowedDirectories
            );
            await this.log("info", "tools", { event: "result", tool: name });
            
            return {
              content: [{ type: "text", text: result }],
            };
          }
          
          case "content_diff": {
            const parsed = ContentDiffArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for content_diff: ${parsed.error}`);
            }
            
            const result = await handleContentDiff(
              parsed.data.content1,
              parsed.data.content2,
              parsed.data.label1,
              parsed.data.label2
            );
            await this.log("info", "tools", { event: "result", tool: name });
            
            return {
              content: [{ type: "text", text: result }],
            };
          }

          
          
          case "patch_files": {
            const parsed = PatchFilesArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for patch_files: ${parsed.error}`);
            }
            
            // Extract options from the request
            const options = {
              preserveIndentation: parsed.data.options?.preserveIndentation ?? true
            };
            
            const result = await handlePatchFiles(
              parsed.data.files,
              parsed.data.dryRun,
              options,
              this.allowedDirectories
            );
            await this.log("info", "tools", { event: "result", tool: name });
            
            return {
              content: [{ type: "text", text: result }],
            };
          }

          
          case "create_directories": {
            const parsed = CreateDirectoriesArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for create_directories: ${parsed.error}`);
            }
            const result = await handleCreateDirectories(parsed.data.paths, this.allowedDirectories);
            await this.log("info", "tools", { event: "result", tool: name });
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "list_directory": {
            const parsed = ListDirectoryArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for list_directory: ${parsed.error}`);
            }
            const result = await handleListDirectory(parsed.data.path, this.allowedDirectories);
            await this.log("info", "tools", { event: "result", tool: name });
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "directory_tree": {
            const parsed = DirectoryTreeArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for directory_tree: ${parsed.error}`);
            }

            const result = await handleDirectoryTree(
              parsed.data.path, 
              parsed.data.excludePatterns,
              this.allowedDirectories
            );
            await this.log("info", "tools", { event: "result", tool: name });
            
            return {
              content: [{
                type: "text",
                text: result
              }],
            };
          }


          case "move_files": {
            const parsed = MoveFilesArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for move_files: ${parsed.error}`);
            }
            
            const result = await handleMoveFiles(
              parsed.data.items,
              parsed.data.overwrite,
              this.allowedDirectories
            );
            await this.log("info", "tools", { event: "result", tool: name });
            
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "search_files": {
            const parsed = SearchFilesArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for search_files: ${parsed.error}`);
            }
            
            const result = await handleSearchFiles(
              parsed.data.path,
              parsed.data.pattern,
              parsed.data.excludePatterns,
              this.allowedDirectories
            );
            await this.log("info", "tools", { event: "result", tool: name });
            
            return {
              content: [{ type: "text", text: result }],
            };
          }
          
          case "search_regex": {
            const parsed = SearchRegexArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for search_regex: ${parsed.error}`);
            }
            
            const result = await handleSearchRegex(
              parsed.data.path,
              parsed.data.pattern,
              parsed.data.filePatterns,
              parsed.data.excludePatterns,
              parsed.data.maxResults,
              parsed.data.caseSensitive,
              this.allowedDirectories
            );
            await this.log("info", "tools", { event: "result", tool: name });
            
            return {
              content: [{ type: "text", text: result }],
            };
          }
          
          case "search_glob": {
            const parsed = SearchGlobArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for search_glob: ${parsed.error}`);
            }
            
            const result = await handleSearchGlob(
              parsed.data.path,
              parsed.data.pattern,
              parsed.data.excludePatterns,
              parsed.data.maxResults,
              this.allowedDirectories
            );
            await this.log("info", "tools", { event: "result", tool: name });
            
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "count_lines": {
            const parsed = CountLinesArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for count_lines: ${parsed.error}`);
            }
            
            const result = await handleCountLines(
              parsed.data.path,
              parsed.data.recursive,
              parsed.data.pattern,
              parsed.data.filePattern,
              parsed.data.excludePatterns,
              parsed.data.ignoreEmptyLines,
              this.allowedDirectories
            );
            await this.log("info", "tools", { event: "result", tool: name });
            
            return {
              content: [{ type: "text", text: result }],
            };
          }
          
          
          
          case "checksum_files": {
            const parsed = ChecksumFilesArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for checksum_files: ${parsed.error}`);
            }
            
            const result = await handleChecksumFiles(
              parsed.data.paths,
              parsed.data.algorithm,
              this.allowedDirectories
            );
            await this.log("info", "tools", { event: "result", tool: name });
            
            return {
              content: [{ type: "text", text: result }],
            };
          }
          
          case "checksum_files_verif": {
            const parsed = ChecksumFilesVerifArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for checksum_files_verif: ${parsed.error}`);
            }
            
            const result = await handleChecksumFilesVerif(
              parsed.data.files,
              parsed.data.algorithm,
              this.allowedDirectories
            );
            await this.log("info", "tools", { event: "result", tool: name });
            
            return {
              content: [{ type: "text", text: result }],
            };
          }
          
          case "get_file_info": {
            const parsed = GetFileInfoArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid arguments for get_file_info: ${parsed.error}`);
            }
            
            const result = await handleGetFileInfo(parsed.data.path, this.allowedDirectories);
            await this.log("info", "tools", { event: "result", tool: name });
            
            return {
              content: [{ type: "text", text: result }],
            };
          }

          case "list_allowed_directories": {
            return {
              content: [{
                type: "text",
                text: `Allowed directories:\n${this.allowedDirectories.join('\n')}`
              }],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await this.log("error", "tools", { event: "error", error: errorMessage });
        return {
          content: [{ type: "text", text: `Error: ${errorMessage}` }],
          isError: true,
        };
      }
    });
  }

  async connect() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Secure MCP Filesystem Server running on stdio");
    console.error("Allowed directories:", this.allowedDirectories);
    await this.log("info", "main", { message: "Server connected via stdio" });
  }
}