import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Stores hoisted inspection registration fixtures.
 */
const registerInspectionToolCatalogTestState = vi.hoisted(() => ({
  getPathMetadataResult: vi.fn(),
  handleGetPathMetadata: vi.fn(),
  getPathMetadataArgsSchema: { schema: "get-path-metadata" },
  getPathMetadataResultSchema: { schema: "get-path-metadata-result" },
  getListDirectoryEntriesResult: vi.fn(),
  handleListDirectoryEntries: vi.fn(),
  listDirectoryEntriesArgsSchema: { schema: "list-directory-entries" },
  listDirectoryEntriesStructuredResultSchema: {
    schema: "list-directory-entries-result",
  },
  handleReadFiles: vi.fn(),
  readFilesWithLineNumbersArgsSchema: {
    schema: "read-files-with-line-numbers",
  },
  getReadFileContentResult: vi.fn(),
  handleReadFileContent: vi.fn(),
  readFileContentFlatArgsSchema: { schema: "read-file-content" },
  readFileContentResultSchema: { schema: "read-file-content-result" },
  normalizeReadFileContentArgs: vi.fn(),
  getFindPathsByNameResult: vi.fn(),
  handleSearchFiles: vi.fn(),
  findPathsByNameArgsSchema: { schema: "find-paths-by-name" },
  findPathsByNameResultSchema: { schema: "find-paths-by-name-result" },
  getFindFilesByGlobResult: vi.fn(),
  handleSearchGlob: vi.fn(),
  findFilesByGlobArgsSchema: { schema: "find-files-by-glob" },
  findFilesByGlobResultSchema: { schema: "find-files-by-glob-result" },
  handleSearchRegex: vi.fn(),
  getSearchRegexStructuredResult: vi.fn(),
  searchFileContentsByRegexArgsSchema: { schema: "search-regex" },
  searchFileContentsByRegexBaseArgsSchema: { schema: "search-regex-base" },
  searchFileContentsByRegexResultSchema: { schema: "search-regex-result" },
  handleSearchFixedString: vi.fn(),
  getSearchFixedStringStructuredResult: vi.fn(),
  searchFileContentsByFixedStringArgsSchema: { schema: "search-fixed-string" },
  searchFileContentsByFixedStringBaseArgsSchema: {
    schema: "search-fixed-string-base",
  },
  searchFileContentsByFixedStringResultSchema: {
    schema: "search-fixed-string-result",
  },
  formatCountLinesResultOutput: vi.fn(),
  getCountLinesResult: vi.fn(),
  countLinesArgsSchema: { schema: "count-lines" },
  countLinesResultSchema: { schema: "count-lines-result" },
  getFileChecksumsResult: vi.fn(),
  handleChecksumFiles: vi.fn(),
  getFileChecksumsArgsSchema: { schema: "get-file-checksums" },
  getFileChecksumsResultSchema: { schema: "get-file-checksums-result" },
  getFileChecksumVerificationResult: vi.fn(),
  handleChecksumFilesVerif: vi.fn(),
  verifyFileChecksumsArgsSchema: { schema: "verify-file-checksums" },
  verifyFileChecksumsResultSchema: {
    schema: "verify-file-checksums-result",
  },
  readOnlyLocalToolAnnotations: { audience: "read-only" },
}));

vi.mock("@domain/inspection/get-path-metadata/handler", () => ({
  getPathMetadataResult:
    registerInspectionToolCatalogTestState.getPathMetadataResult,
  handleGetPathMetadata:
    registerInspectionToolCatalogTestState.handleGetPathMetadata,
}));

vi.mock("@domain/inspection/get-path-metadata/schema", () => ({
  GetPathMetadataArgsSchema:
    registerInspectionToolCatalogTestState.getPathMetadataArgsSchema,
  GetPathMetadataResultSchema:
    registerInspectionToolCatalogTestState.getPathMetadataResultSchema,
}));

vi.mock("@domain/inspection/list-directory-entries/handler", () => ({
  getListDirectoryEntriesResult:
    registerInspectionToolCatalogTestState.getListDirectoryEntriesResult,
  handleListDirectoryEntries:
    registerInspectionToolCatalogTestState.handleListDirectoryEntries,
}));

vi.mock("@domain/inspection/list-directory-entries/schema", () => ({
  ListDirectoryEntriesArgsSchema:
    registerInspectionToolCatalogTestState.listDirectoryEntriesArgsSchema,
  ListDirectoryEntriesStructuredResultSchema:
    registerInspectionToolCatalogTestState.listDirectoryEntriesStructuredResultSchema,
}));

vi.mock("@domain/inspection/read-files-with-line-numbers/handler", () => ({
  handleReadFiles: registerInspectionToolCatalogTestState.handleReadFiles,
}));

vi.mock("@domain/inspection/read-files-with-line-numbers/schema", () => ({
  ReadFilesWithLineNumbersArgsSchema:
    registerInspectionToolCatalogTestState.readFilesWithLineNumbersArgsSchema,
}));

vi.mock("@domain/inspection/read-file-content/handler", () => ({
  getReadFileContentResult:
    registerInspectionToolCatalogTestState.getReadFileContentResult,
  handleReadFileContent:
    registerInspectionToolCatalogTestState.handleReadFileContent,
}));

vi.mock("@domain/inspection/read-file-content/schema", () => ({
  ReadFileContentFlatArgsSchema:
    registerInspectionToolCatalogTestState.readFileContentFlatArgsSchema,
  ReadFileContentResultSchema:
    registerInspectionToolCatalogTestState.readFileContentResultSchema,
  normalizeReadFileContentArgs:
    registerInspectionToolCatalogTestState.normalizeReadFileContentArgs,
}));

vi.mock("@domain/inspection/find-paths-by-name/handler", () => ({
  getFindPathsByNameResult:
    registerInspectionToolCatalogTestState.getFindPathsByNameResult,
  handleSearchFiles: registerInspectionToolCatalogTestState.handleSearchFiles,
}));

vi.mock("@domain/inspection/find-paths-by-name/schema", () => ({
  FindPathsByNameArgsSchema:
    registerInspectionToolCatalogTestState.findPathsByNameArgsSchema,
  FindPathsByNameResultSchema:
    registerInspectionToolCatalogTestState.findPathsByNameResultSchema,
}));

vi.mock("@domain/inspection/find-files-by-glob/handler", () => ({
  getFindFilesByGlobResult:
    registerInspectionToolCatalogTestState.getFindFilesByGlobResult,
  handleSearchGlob: registerInspectionToolCatalogTestState.handleSearchGlob,
}));

vi.mock("@domain/inspection/find-files-by-glob/schema", () => ({
  FindFilesByGlobArgsSchema:
    registerInspectionToolCatalogTestState.findFilesByGlobArgsSchema,
  FindFilesByGlobResultSchema:
    registerInspectionToolCatalogTestState.findFilesByGlobResultSchema,
}));

vi.mock("@domain/inspection/search-file-contents-by-regex/handler", () => ({
  handleSearchRegex: registerInspectionToolCatalogTestState.handleSearchRegex,
  getSearchRegexResult:
    registerInspectionToolCatalogTestState.getSearchRegexStructuredResult,
}));

vi.mock("@domain/inspection/search-file-contents-by-regex/schema", () => ({
  SearchFileContentsByRegexArgsSchema:
    registerInspectionToolCatalogTestState.searchFileContentsByRegexArgsSchema,
  SearchFileContentsByRegexBaseArgsSchema:
    registerInspectionToolCatalogTestState.searchFileContentsByRegexBaseArgsSchema,
  SearchFileContentsByRegexResultSchema:
    registerInspectionToolCatalogTestState.searchFileContentsByRegexResultSchema,
}));

vi.mock("@domain/inspection/search-file-contents-by-fixed-string/handler", () => ({
  handleSearchFixedString:
    registerInspectionToolCatalogTestState.handleSearchFixedString,
  getSearchFixedStringResult:
    registerInspectionToolCatalogTestState.getSearchFixedStringStructuredResult,
}));

vi.mock("@domain/inspection/search-file-contents-by-fixed-string/schema", () => ({
  SearchFileContentsByFixedStringArgsSchema:
    registerInspectionToolCatalogTestState.searchFileContentsByFixedStringArgsSchema,
  SearchFileContentsByFixedStringBaseArgsSchema:
    registerInspectionToolCatalogTestState.searchFileContentsByFixedStringBaseArgsSchema,
  SearchFileContentsByFixedStringResultSchema:
    registerInspectionToolCatalogTestState.searchFileContentsByFixedStringResultSchema,
}));

vi.mock("@domain/inspection/count-lines/handler", () => ({
  formatCountLinesResultOutput:
    registerInspectionToolCatalogTestState.formatCountLinesResultOutput,
  getCountLinesResult: registerInspectionToolCatalogTestState.getCountLinesResult,
}));

vi.mock("@domain/inspection/count-lines/schema", () => ({
  CountLinesArgsSchema: registerInspectionToolCatalogTestState.countLinesArgsSchema,
  CountLinesResultSchema:
    registerInspectionToolCatalogTestState.countLinesResultSchema,
}));

vi.mock("@domain/inspection/get-file-checksums/handler", () => ({
  getFileChecksumsResult:
    registerInspectionToolCatalogTestState.getFileChecksumsResult,
  handleChecksumFiles: registerInspectionToolCatalogTestState.handleChecksumFiles,
}));

vi.mock("@domain/inspection/get-file-checksums/schema", () => ({
  GetFileChecksumsArgsSchema:
    registerInspectionToolCatalogTestState.getFileChecksumsArgsSchema,
  GetFileChecksumsResultSchema:
    registerInspectionToolCatalogTestState.getFileChecksumsResultSchema,
}));

vi.mock("@domain/inspection/verify-file-checksums/handler", () => ({
  getFileChecksumVerificationResult:
    registerInspectionToolCatalogTestState.getFileChecksumVerificationResult,
  handleChecksumFilesVerif:
    registerInspectionToolCatalogTestState.handleChecksumFilesVerif,
}));

vi.mock("@domain/inspection/verify-file-checksums/schema", () => ({
  VerifyFileChecksumsArgsSchema:
    registerInspectionToolCatalogTestState.verifyFileChecksumsArgsSchema,
  VerifyFileChecksumsResultSchema:
    registerInspectionToolCatalogTestState.verifyFileChecksumsResultSchema,
}));

vi.mock("@application/server/tool-registration-presets", () => ({
  READ_ONLY_LOCAL_TOOL_ANNOTATIONS:
    registerInspectionToolCatalogTestState.readOnlyLocalToolAnnotations,
}));

import { registerInspectionToolCatalog } from "@application/server/register-inspection-tool-catalog";

describe("register-inspection-tool-catalog", () => {
  beforeEach(() => {
    registerInspectionToolCatalogTestState.getPathMetadataResult.mockClear();
    registerInspectionToolCatalogTestState.handleGetPathMetadata.mockClear();
    registerInspectionToolCatalogTestState.getListDirectoryEntriesResult.mockClear();
    registerInspectionToolCatalogTestState.handleListDirectoryEntries.mockClear();
    registerInspectionToolCatalogTestState.handleReadFiles.mockClear();
    registerInspectionToolCatalogTestState.getReadFileContentResult.mockClear();
    registerInspectionToolCatalogTestState.handleReadFileContent.mockClear();
    registerInspectionToolCatalogTestState.normalizeReadFileContentArgs.mockClear();
    registerInspectionToolCatalogTestState.getFindPathsByNameResult.mockClear();
    registerInspectionToolCatalogTestState.handleSearchFiles.mockClear();
    registerInspectionToolCatalogTestState.getFindFilesByGlobResult.mockClear();
    registerInspectionToolCatalogTestState.handleSearchGlob.mockClear();
    registerInspectionToolCatalogTestState.handleSearchRegex.mockClear();
    registerInspectionToolCatalogTestState.getSearchRegexStructuredResult.mockClear();
    registerInspectionToolCatalogTestState.handleSearchFixedString.mockClear();
    registerInspectionToolCatalogTestState.getSearchFixedStringStructuredResult.mockClear();
    registerInspectionToolCatalogTestState.formatCountLinesResultOutput.mockClear();
    registerInspectionToolCatalogTestState.getCountLinesResult.mockClear();
    registerInspectionToolCatalogTestState.getFileChecksumsResult.mockClear();
    registerInspectionToolCatalogTestState.handleChecksumFiles.mockClear();
    registerInspectionToolCatalogTestState.getFileChecksumVerificationResult.mockClear();
    registerInspectionToolCatalogTestState.handleChecksumFilesVerif.mockClear();
  });

  it("registers the complete inspection tool catalog in a stable order", () => {
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

    Reflect.apply(registerInspectionToolCatalog, undefined, [context]);

    expect(registerTool).toHaveBeenCalledTimes(11);
    expect(registerTool.mock.calls.map(([toolName]) => toolName)).toEqual([
      "read_files_with_line_numbers",
      "read_file_content",
      "list_directory_entries",
      "find_paths_by_name",
      "find_files_by_glob",
      "search_file_contents_by_regex",
      "search_file_contents_by_fixed_string",
      "count_lines",
      "get_file_checksums",
      "verify_file_checksums",
      "get_path_metadata",
    ]);

    expect(registerTool).toHaveBeenNthCalledWith(
      1,
      "read_files_with_line_numbers",
      expect.objectContaining({
        title: "Read files with line numbers",
        annotations:
          registerInspectionToolCatalogTestState.readOnlyLocalToolAnnotations,
        inputSchema:
          registerInspectionToolCatalogTestState.readFilesWithLineNumbersArgsSchema,
      }),
      expect.any(Function),
    );
    expect(registerTool).toHaveBeenNthCalledWith(
      2,
      "read_file_content",
      expect.objectContaining({
        title: "Read file content",
        annotations:
          registerInspectionToolCatalogTestState.readOnlyLocalToolAnnotations,
        inputSchema:
          registerInspectionToolCatalogTestState.readFileContentFlatArgsSchema,
        outputSchema:
          registerInspectionToolCatalogTestState.readFileContentResultSchema,
      }),
      expect.any(Function),
    );
    expect(registerTool).toHaveBeenNthCalledWith(
      11,
      "get_path_metadata",
      expect.objectContaining({
        title: "Get path metadata",
        annotations:
          registerInspectionToolCatalogTestState.readOnlyLocalToolAnnotations,
        inputSchema:
          registerInspectionToolCatalogTestState.getPathMetadataArgsSchema,
        outputSchema:
          registerInspectionToolCatalogTestState.getPathMetadataResultSchema,
      }),
      expect.any(Function),
    );
  });

  it("keeps the read-file-content registration bound to the normalized single-file contract surfaces", () => {
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

    Reflect.apply(registerInspectionToolCatalog, undefined, [context]);

    const readFileContentRegistration = registerTool.mock.calls.find(
      ([toolName]) => toolName === "read_file_content",
    );

    if (readFileContentRegistration === undefined) {
      throw new Error("Expected read_file_content to be registered.");
    }

    const [, registration] = readFileContentRegistration;

    expect(registration.description).toContain("line-range");
    expect(registration.description).toContain("chunk-cursor");
    expect(registration.inputSchema).toBe(
      registerInspectionToolCatalogTestState.readFileContentFlatArgsSchema,
    );
    expect(registration.outputSchema).toBe(
      registerInspectionToolCatalogTestState.readFileContentResultSchema,
    );
  });
});
