import { handleFileDiff } from "@domain/comparison/diff-files/handler";
import { DiffFilesArgsSchema } from "@domain/comparison/diff-files/schema";
import { handleContentDiff } from "@domain/comparison/diff-text-content/handler";
import { DiffTextContentArgsSchema } from "@domain/comparison/diff-text-content/schema";
import { handleCreateFiles } from "@domain/mutation/create-files/handler";
import { CreateFilesArgsSchema } from "@domain/mutation/create-files/schema";
import { handleAppendFiles } from "@domain/mutation/append-files/handler";
import { AppendFilesArgsSchema } from "@domain/mutation/append-files/schema";
import { handleReplaceFileLineRanges } from "@domain/mutation/replace-file-line-ranges/handler";
import { ReplaceFileLineRangesArgsSchema } from "@domain/mutation/replace-file-line-ranges/schema";
import { handleCreateDirectories } from "@domain/mutation/create-directories/handler";
import { CreateDirectoriesArgsSchema } from "@domain/mutation/create-directories/schema";
import { handleCopyPaths } from "@domain/mutation/copy-paths/handler";
import { CopyPathsArgsSchema } from "@domain/mutation/copy-paths/schema";
import { handleMovePaths } from "@domain/mutation/move-paths/handler";
import { MovePathsArgsSchema } from "@domain/mutation/move-paths/schema";
import { handleDeletePaths } from "@domain/mutation/delete-paths/handler";
import { DeletePathsArgsSchema } from "@domain/mutation/delete-paths/schema";

import type { RegisterToolCatalogContext } from "./register-tool-catalog";
import {
  ADDITIVE_LOCAL_TOOL_ANNOTATIONS,
  DESTRUCTIVE_LOCAL_TOOL_ANNOTATIONS,
  IDEMPOTENT_ADDITIVE_LOCAL_TOOL_ANNOTATIONS,
  READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
} from "./tool-registration-presets";

/**
 * Registers only the comparison and mutation tool families on the application-layer MCP server
 * shell.
 *
 * @remarks
 * These descriptions are the caller-visible summary of raw-text budgets, blast-radius limits, and
 * non-bypassable mutation safeguards. They must stay aligned to the implemented guardrail model and
 * preserve canonical same-concept surfaces such as `replacementText` when line-range replacement is
 * exposed at registration time.
 */
export function registerComparisonAndMutationToolCatalog(
  context: RegisterToolCatalogContext,
): void {
  const { server, allowedDirectories, executeTool } = context;

  server.registerTool(
    "create_files",
    {
      title: "Create files",
      description:
        "Creates one or more new text files. " +
        "Use this tool only when the target files do not already exist. " +
        "Per-item and cumulative content budgets are enforced server-side, so oversized payloads are refused rather than truncated.",
      annotations: ADDITIVE_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: CreateFilesArgsSchema,
    },
    async ({ files }) =>
      executeTool("create_files", () => handleCreateFiles(files, allowedDirectories)),
  );

  server.registerTool(
    "append_files",
    {
      title: "Append files",
      description:
        "Appends text content to one or more files. " +
        "Use this tool for additive writes at file end, not targeted replacement. " +
        "Per-item and cumulative content budgets are enforced server-side, so oversized payloads are refused rather than truncated.",
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
        "Use this tool only for removal, not for in-place rewrite workflows. " +
        "Batch-size and blast-radius limits are enforced server-side and cannot be bypassed.",
      annotations: DESTRUCTIVE_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: DeletePathsArgsSchema,
    },
    async ({ paths, recursive }) =>
      executeTool("delete_paths", () => handleDeletePaths(paths, recursive, allowedDirectories)),
  );

  server.registerTool(
    "copy_paths",
    {
      title: "Copy paths",
      description:
        "Copies files or directories to new destinations. " +
        "Use this tool when the source should remain in place after the operation. " +
        "Batch-size and blast-radius limits are enforced server-side and cannot be bypassed.",
      annotations: ADDITIVE_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: CopyPathsArgsSchema,
    },
    async ({ operations }) =>
      executeTool("copy_paths", () =>
        handleCopyPaths(
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
        "Use this tool when the comparison source is already stored on disk. " +
        "Pair-count and response-size budgets are enforced server-side, so narrow the comparison set when a projected diff is refused.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: DiffFilesArgsSchema,
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
        "Use this tool when the compared inputs are provided directly rather than read from files. " +
        "Stricter raw-text and response-size budgets are enforced server-side for caller-supplied content, so oversized text pairs are refused.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: DiffTextContentArgsSchema,
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
        "Use this tool for direct line-range replacement, not unified diff patch text. " +
        "Per-file replacement-count, replacement-text, and preview budgets are enforced server-side, so reduce the replacement scope when a request is refused.",
      annotations: DESTRUCTIVE_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: ReplaceFileLineRangesArgsSchema,
    },
    async ({ files, dryRun }) =>
      executeTool("replace_file_line_ranges", () =>
        handleReplaceFileLineRanges(
           files.map((file) => ({
             path: file.path,
             replacements: file.replacements.map((replacement) => ({
               startLine: replacement.startLine,
               endLine: replacement.endLine,
               replacementText: replacement.replacementText,
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
        "Use this tool for directory creation only. " +
        "Batch-size and large-scale operation limits are enforced server-side and cannot be bypassed.",
      annotations: IDEMPOTENT_ADDITIVE_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: CreateDirectoriesArgsSchema,
    },
    async ({ paths }) =>
      executeTool("create_directories", () => handleCreateDirectories(paths, allowedDirectories)),
  );

  server.registerTool(
    "move_paths",
    {
      title: "Move paths",
      description:
        "Moves or renames files or directories. " +
        "Use this tool when the source should no longer remain at the original path. " +
        "Batch-size and blast-radius limits are enforced server-side and cannot be bypassed.",
      annotations: DESTRUCTIVE_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: MovePathsArgsSchema,
    },
    async ({ operations, overwrite }) =>
      executeTool("move_paths", () =>
        handleMovePaths(
          operations.map((operation) => ({
            source: operation.sourcePath,
            destination: operation.destinationPath,
          })),
          overwrite,
          allowedDirectories,
        ),
      ),
  );
}
