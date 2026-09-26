import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Stores hoisted comparison and mutation registration fixtures.
 */
const registerComparisonAndMutationToolCatalogTestState = vi.hoisted(() => ({
  handleFileDiff: vi.fn(),
  diffFilesArgsSchema: { schema: "diff-files" },
  handleContentDiff: vi.fn(),
  diffTextContentArgsSchema: { schema: "diff-text-content" },
  handleCreateFiles: vi.fn(),
  createFilesArgsSchema: { schema: "create-files" },
  handleAppendFiles: vi.fn(),
  appendFilesArgsSchema: { schema: "append-files" },
  handleReplaceFileLineRanges: vi.fn(),
  replaceFileLineRangesArgsSchema: { schema: "replace-file-line-ranges" },
  handleCreateDirectories: vi.fn(),
  createDirectoriesArgsSchema: { schema: "create-directories" },
  handleCopyPaths: vi.fn(),
  copyPathsArgsSchema: { schema: "copy-paths" },
  handleMovePaths: vi.fn(),
  movePathsArgsSchema: { schema: "move-paths" },
  handleDeletePaths: vi.fn(),
  deletePathsArgsSchema: { schema: "delete-paths" },
  handleCreateSymbolicLinks: vi.fn(),
  createSymbolicLinksArgsSchema: { schema: "create-symbolic-links" },
  readOnlyLocalToolAnnotations: { audience: "read-only" },
  additiveLocalToolAnnotations: { audience: "additive" },
  idempotentAdditiveLocalToolAnnotations: { audience: "idempotent-additive" },
  destructiveLocalToolAnnotations: { audience: "destructive" },
}));

vi.mock("@domain/comparison/diff-files/handler", () => ({
  handleFileDiff:
    registerComparisonAndMutationToolCatalogTestState.handleFileDiff,
}));

vi.mock("@domain/comparison/diff-files/schema", () => ({
  DiffFilesArgsSchema:
    registerComparisonAndMutationToolCatalogTestState.diffFilesArgsSchema,
}));

vi.mock("@domain/comparison/diff-text-content/handler", () => ({
  handleContentDiff:
    registerComparisonAndMutationToolCatalogTestState.handleContentDiff,
}));

vi.mock("@domain/comparison/diff-text-content/schema", () => ({
  DiffTextContentArgsSchema:
    registerComparisonAndMutationToolCatalogTestState.diffTextContentArgsSchema,
}));

vi.mock("@domain/mutation/create-files/handler", () => ({
  handleCreateFiles:
    registerComparisonAndMutationToolCatalogTestState.handleCreateFiles,
}));

vi.mock("@domain/mutation/create-files/schema", () => ({
  CreateFilesArgsSchema:
    registerComparisonAndMutationToolCatalogTestState.createFilesArgsSchema,
}));

vi.mock("@domain/mutation/append-files/handler", () => ({
  handleAppendFiles:
    registerComparisonAndMutationToolCatalogTestState.handleAppendFiles,
}));

vi.mock("@domain/mutation/append-files/schema", () => ({
  AppendFilesArgsSchema:
    registerComparisonAndMutationToolCatalogTestState.appendFilesArgsSchema,
}));

vi.mock("@domain/mutation/replace-file-line-ranges/handler", () => ({
  handleReplaceFileLineRanges:
    registerComparisonAndMutationToolCatalogTestState.handleReplaceFileLineRanges,
}));

vi.mock("@domain/mutation/replace-file-line-ranges/schema", () => ({
  ReplaceFileLineRangesArgsSchema:
    registerComparisonAndMutationToolCatalogTestState.replaceFileLineRangesArgsSchema,
}));

vi.mock("@domain/mutation/create-directories/handler", () => ({
  handleCreateDirectories:
    registerComparisonAndMutationToolCatalogTestState.handleCreateDirectories,
}));

vi.mock("@domain/mutation/create-directories/schema", () => ({
  CreateDirectoriesArgsSchema:
    registerComparisonAndMutationToolCatalogTestState.createDirectoriesArgsSchema,
}));

vi.mock("@domain/mutation/copy-paths/handler", () => ({
  handleCopyPaths:
    registerComparisonAndMutationToolCatalogTestState.handleCopyPaths,
}));

vi.mock("@domain/mutation/copy-paths/schema", () => ({
  CopyPathsArgsSchema:
    registerComparisonAndMutationToolCatalogTestState.copyPathsArgsSchema,
}));

vi.mock("@domain/mutation/move-paths/handler", () => ({
  handleMovePaths:
    registerComparisonAndMutationToolCatalogTestState.handleMovePaths,
}));

vi.mock("@domain/mutation/move-paths/schema", () => ({
  MovePathsArgsSchema:
    registerComparisonAndMutationToolCatalogTestState.movePathsArgsSchema,
}));

vi.mock("@domain/mutation/delete-paths/handler", () => ({
  handleDeletePaths:
    registerComparisonAndMutationToolCatalogTestState.handleDeletePaths,
}));

vi.mock("@domain/mutation/delete-paths/schema", () => ({
  DeletePathsArgsSchema:
    registerComparisonAndMutationToolCatalogTestState.deletePathsArgsSchema,
}));

vi.mock("@domain/mutation/create-symbolic-links/handler", () => ({
  handleCreateSymbolicLinks:
    registerComparisonAndMutationToolCatalogTestState.handleCreateSymbolicLinks,
}));

vi.mock("@domain/mutation/create-symbolic-links/schema", () => ({
  CreateSymbolicLinksArgsSchema:
    registerComparisonAndMutationToolCatalogTestState.createSymbolicLinksArgsSchema,
}));

vi.mock("@application/server/tool-registration-presets", () => ({
  READ_ONLY_LOCAL_TOOL_ANNOTATIONS:
    registerComparisonAndMutationToolCatalogTestState.readOnlyLocalToolAnnotations,
  ADDITIVE_LOCAL_TOOL_ANNOTATIONS:
    registerComparisonAndMutationToolCatalogTestState.additiveLocalToolAnnotations,
  IDEMPOTENT_ADDITIVE_LOCAL_TOOL_ANNOTATIONS:
    registerComparisonAndMutationToolCatalogTestState.idempotentAdditiveLocalToolAnnotations,
  DESTRUCTIVE_LOCAL_TOOL_ANNOTATIONS:
    registerComparisonAndMutationToolCatalogTestState.destructiveLocalToolAnnotations,
  buildAppendFilesToolDescription: () => "Appends text content to one or more files.",
  buildCopyPathsToolDescription: () => "Copies files or directories to new destinations.",
  buildCreateDirectoriesToolDescription: () => "Creates one or more directory paths, including missing parent directories.",
  buildCreateFilesToolDescription: () => "Creates one or more new text files.",
  buildCreateSymbolicLinksToolDescription: () => "Creates one or more symbolic links.",
  buildDeletePathsToolDescription: () => "Deletes files or directories.",
  buildDiffFilesToolDescription: () => "Compares the contents of one or more file pairs and returns unified diffs.",
  buildDiffTextContentToolDescription: () => "Compares one or more in-memory text content pairs and returns unified diffs.",
  buildMovePathsToolDescription: () => "Moves or renames files or directories.",
  buildReplaceFileLineRangesToolDescription: () => "Replaces one or more 1-based inclusive line ranges in existing text files using replacementText.",
}));

import { registerComparisonAndMutationToolCatalog } from "@application/server/register-comparison-and-mutation-tool-catalog";

describe("register-comparison-and-mutation-tool-catalog", () => {
  beforeEach(() => {
    registerComparisonAndMutationToolCatalogTestState.handleFileDiff.mockClear();
    registerComparisonAndMutationToolCatalogTestState.handleContentDiff.mockClear();
    registerComparisonAndMutationToolCatalogTestState.handleCreateFiles.mockClear();
    registerComparisonAndMutationToolCatalogTestState.handleAppendFiles.mockClear();
    registerComparisonAndMutationToolCatalogTestState.handleReplaceFileLineRanges.mockClear();
    registerComparisonAndMutationToolCatalogTestState.handleCreateDirectories.mockClear();
    registerComparisonAndMutationToolCatalogTestState.handleCopyPaths.mockClear();
    registerComparisonAndMutationToolCatalogTestState.handleMovePaths.mockClear();
    registerComparisonAndMutationToolCatalogTestState.handleDeletePaths.mockClear();
    registerComparisonAndMutationToolCatalogTestState.handleCreateSymbolicLinks.mockClear();
  });

  it("registers the complete comparison and mutation tool catalog in a stable order", () => {
    const registerTool = vi.fn();
    const context = {
      server: {
        registerTool,
      },
      allowedDirectories: ["C:/allowed"],
      inspectionResumeSessionStore: {
        cleanupExpiredSessions: vi.fn(),
      },
      executeTool: vi.fn(),
    };

    Reflect.apply(registerComparisonAndMutationToolCatalog, undefined, [context]);

    expect(registerTool).toHaveBeenCalledTimes(10);
    expect(registerTool.mock.calls.map(([toolName]) => toolName)).toEqual([
      "create_files",
      "append_files",
      "delete_paths",
      "copy_paths",
      "diff_files",
      "diff_text_content",
      "replace_file_line_ranges",
      "create_directories",
      "move_paths",
      "create_symbolic_links",
    ]);

    expect(registerTool).toHaveBeenNthCalledWith(
      1,
      "create_files",
      expect.objectContaining({
        title: "Create files",
        annotations:
          registerComparisonAndMutationToolCatalogTestState.additiveLocalToolAnnotations,
        inputSchema:
          registerComparisonAndMutationToolCatalogTestState.createFilesArgsSchema,
      }),
      expect.any(Function),
    );
    expect(registerTool).toHaveBeenNthCalledWith(
      7,
      "replace_file_line_ranges",
      expect.objectContaining({
        title: "Replace file line ranges",
        annotations:
          registerComparisonAndMutationToolCatalogTestState.destructiveLocalToolAnnotations,
        inputSchema:
          registerComparisonAndMutationToolCatalogTestState.replaceFileLineRangesArgsSchema,
      }),
      expect.any(Function),
    );
    expect(registerTool).toHaveBeenNthCalledWith(
      9,
      "move_paths",
      expect.objectContaining({
        title: "Move paths",
        annotations:
          registerComparisonAndMutationToolCatalogTestState.destructiveLocalToolAnnotations,
        inputSchema:
          registerComparisonAndMutationToolCatalogTestState.movePathsArgsSchema,
      }),
      expect.any(Function),
    );
    expect(registerTool).toHaveBeenNthCalledWith(
      10,
      "create_symbolic_links",
      expect.objectContaining({
        title: "Create symbolic links",
        annotations:
          registerComparisonAndMutationToolCatalogTestState.additiveLocalToolAnnotations,
        inputSchema:
          registerComparisonAndMutationToolCatalogTestState.createSymbolicLinksArgsSchema,
      }),
      expect.any(Function),
    );
  });

  it("keeps the replace-file-line-ranges registration bound to the canonical replacementText surface", () => {
    const registerTool = vi.fn();
    const context = {
      server: {
        registerTool,
      },
      allowedDirectories: ["C:/allowed"],
      inspectionResumeSessionStore: {
        cleanupExpiredSessions: vi.fn(),
      },
      executeTool: vi.fn(),
    };

    Reflect.apply(registerComparisonAndMutationToolCatalog, undefined, [context]);

    const replaceRegistration = registerTool.mock.calls.find(
      ([toolName]) => toolName === "replace_file_line_ranges",
    );

    if (replaceRegistration === undefined) {
      throw new Error("Expected replace_file_line_ranges to be registered.");
    }

    const [, registration] = replaceRegistration;

    expect(registration.description).toContain("replacementText");
    expect(registration.description).toContain("line ranges");
    expect(registration.inputSchema).toBe(
      registerComparisonAndMutationToolCatalogTestState.replaceFileLineRangesArgsSchema,
    );
  });

  it("invokes every registered comparison and mutation tool callback through the executeTool boundary", async () => {
    const registerTool = vi.fn();
    const executeTool = vi.fn(
      (_toolName: string, operation: () => unknown) => operation(),
    );
    const context = {
      server: {
        registerTool,
      },
      allowedDirectories: ["C:/allowed"],
      inspectionResumeSessionStore: {
        cleanupExpiredSessions: vi.fn(),
      },
      executeTool,
    };

    Reflect.apply(registerComparisonAndMutationToolCatalog, undefined, [context]);

    const registeredCallbackByToolName = new Map(
      registerTool.mock.calls.map(([toolName, , callback]) => [
        toolName,
        callback,
      ]),
    );

    registerComparisonAndMutationToolCatalogTestState.handleFileDiff.mockResolvedValue("text");
    registerComparisonAndMutationToolCatalogTestState.handleContentDiff.mockResolvedValue("text");
    registerComparisonAndMutationToolCatalogTestState.handleCreateFiles.mockResolvedValue("text");
    registerComparisonAndMutationToolCatalogTestState.handleAppendFiles.mockResolvedValue("text");
    registerComparisonAndMutationToolCatalogTestState.handleReplaceFileLineRanges.mockResolvedValue("text");
    registerComparisonAndMutationToolCatalogTestState.handleCreateDirectories.mockResolvedValue("text");
    registerComparisonAndMutationToolCatalogTestState.handleCopyPaths.mockResolvedValue("text");
    registerComparisonAndMutationToolCatalogTestState.handleMovePaths.mockResolvedValue("text");
    registerComparisonAndMutationToolCatalogTestState.handleDeletePaths.mockResolvedValue("text");
    registerComparisonAndMutationToolCatalogTestState.handleCreateSymbolicLinks.mockResolvedValue("text");

    for (const toolName of registeredCallbackByToolName.keys()) {
      const callback = registeredCallbackByToolName.get(toolName);

      if (callback === undefined) {
        throw new Error(`Expected ${toolName} to be registered.`);
      }

      await Reflect.apply(callback, undefined, [{
        files: [],
        links: [],
        operations: [],
        pairs: [],
        paths: [],
        replacements: [],
      }]);
    }

    expect(executeTool).toHaveBeenCalledTimes(10);
    expect(executeTool.mock.calls.map(([toolName]) => toolName)).toEqual([
      "create_files",
      "append_files",
      "delete_paths",
      "copy_paths",
      "diff_files",
      "diff_text_content",
      "replace_file_line_ranges",
      "create_directories",
      "move_paths",
      "create_symbolic_links",
    ]);
  });
});
