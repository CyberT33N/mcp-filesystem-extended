import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockedAssertActualTextBudget,
  mockedAssertExpectedFileTypes,
  mockedAssertProjectedTextBudget,
  mockedCollectValidatedFilesystemPreflightEntries,
  mockedDetectIoCapabilityProfile,
  mockedReadFile,
  mockedReadFileContentByteRange,
  mockedReadFileContentChunkCursor,
  mockedReadFileContentLineRange,
  mockedResolveSearchExecutionPolicy,
} = vi.hoisted(() => ({
  mockedAssertActualTextBudget: vi.fn(),
  mockedAssertExpectedFileTypes: vi.fn(),
  mockedAssertProjectedTextBudget: vi.fn(),
  mockedCollectValidatedFilesystemPreflightEntries: vi.fn(),
  mockedDetectIoCapabilityProfile: vi.fn(),
  mockedReadFile: vi.fn(),
  mockedReadFileContentByteRange: vi.fn(),
  mockedReadFileContentChunkCursor: vi.fn(),
  mockedReadFileContentLineRange: vi.fn(),
  mockedResolveSearchExecutionPolicy: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: mockedReadFile,
}));

vi.mock("@domain/shared/guardrails/filesystem-preflight", () => ({
  assertExpectedFileTypes: mockedAssertExpectedFileTypes,
  collectValidatedFilesystemPreflightEntries:
    mockedCollectValidatedFilesystemPreflightEntries,
}));

vi.mock("@domain/shared/guardrails/text-response-budget", () => ({
  assertActualTextBudget: mockedAssertActualTextBudget,
  assertProjectedTextBudget: mockedAssertProjectedTextBudget,
}));

vi.mock("@domain/shared/search/search-execution-policy", () => ({
  resolveSearchExecutionPolicy: mockedResolveSearchExecutionPolicy,
}));

vi.mock("@infrastructure/runtime/io-capability-detector", () => ({
  detectIoCapabilityProfile: mockedDetectIoCapabilityProfile,
}));

vi.mock("@infrastructure/filesystem/streaming-file-content-reader", () => ({
  readFileContentByteRange: mockedReadFileContentByteRange,
  readFileContentChunkCursor: mockedReadFileContentChunkCursor,
  readFileContentLineRange: mockedReadFileContentLineRange,
}));

import {
  CpuRegexTier,
  DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE,
  IoCapabilitySampleOrigin,
  RuntimeConfidenceTier,
  SourceReadTier,
  SpoolWriteTier,
} from "@domain/shared/runtime/io-capability-profile";
import {
  getReadFileContentResult,
  handleReadFileContent,
} from "@domain/inspection/read-file-content/handler";
import {
  ReadFileContentArgsSchema,
  READ_FILE_CONTENT_BYTE_RANGE_DEFAULT_BYTES,
  READ_FILE_CONTENT_LINE_RANGE_DEFAULT_LINES,
  READ_FILE_CONTENT_TOOL_NAME,
  normalizeReadFileContentArgs,
} from "@domain/inspection/read-file-content/schema";

const TEST_IO_CAPABILITY_PROFILE = {
  ...DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE,
  cpuRegexTier: CpuRegexTier.B,
  estimatedSourceReadBytesPerSecond: 900_000_000,
  estimatedSpoolWriteBytesPerSecond: 550_000_000,
  lastCalibratedAt: "2026-04-16T21:30:00Z",
  runtimeConfidenceTier: RuntimeConfidenceTier.HIGH,
  sampleOrigin: IoCapabilitySampleOrigin.RUNTIME_TELEMETRY,
  sourceReadTier: SourceReadTier.A,
  spoolWriteTier: SpoolWriteTier.A,
};

const TEST_SEARCH_EXECUTION_POLICY = {
  effectiveCpuRegexTier: CpuRegexTier.B,
  effectiveSourceReadTier: SourceReadTier.A,
  fixedStringServiceHardGapBytes: 32 * 1_024 * 1_024,
  fixedStringSyncCandidateBytesCap: 16 * 1_024 * 1_024,
  previewFirstResponseCapFraction: 0.5,
  regexServiceHardGapBytes: 32 * 1_024 * 1_024,
  regexSyncCandidateBytesCap: 12 * 1_024 * 1_024,
  runtimeConfidenceTier: RuntimeConfidenceTier.HIGH,
  syncComfortWindowSeconds: 15,
  taskRecommendedAfterSeconds: 60,
};

describe("read_file_content", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedCollectValidatedFilesystemPreflightEntries.mockResolvedValue([
      {
        requestedPath: "docs/notes.txt",
        size: 13,
        validPath: "C:/allowed/docs/notes.txt",
      },
    ]);
    mockedDetectIoCapabilityProfile.mockReturnValue(TEST_IO_CAPABILITY_PROFILE);
    mockedResolveSearchExecutionPolicy.mockReturnValue(
      TEST_SEARCH_EXECUTION_POLICY,
    );
    mockedReadFile.mockResolvedValue("hello world!\n");
    mockedReadFileContentLineRange.mockResolvedValue({
      content: "line one\nline two\n",
      endLine: 2,
      hasMore: true,
      nextLine: 3,
      returnedByteCount: 18,
      returnedLineCount: 2,
      startLine: 1,
    });
    mockedReadFileContentByteRange.mockResolvedValue({
      content: "hello world!",
      endByteExclusive: 12,
      hasMore: true,
      nextByteOffset: 12,
      returnedByteCount: 12,
      startByte: 0,
    });
    mockedReadFileContentChunkCursor.mockResolvedValue({
      content: "chunk payload",
      cursor: "cursor-1",
      endByteExclusive: 12,
      hasMore: true,
      nextCursor: "cursor-2",
      returnedByteCount: 12,
      startByte: 0,
    });
  });

  it("normalizes the public ranged and cursor request blocks into the canonical request contract", () => {
    expect(
      normalizeReadFileContentArgs(
        ReadFileContentArgsSchema.parse({
          mode: "line-range",
          path: "docs/notes.txt",
        }),
      ),
    ).toEqual({
      lineCount: READ_FILE_CONTENT_LINE_RANGE_DEFAULT_LINES,
      mode: "line_range",
      path: "docs/notes.txt",
      startLine: 1,
    });

    expect(
      normalizeReadFileContentArgs(
        ReadFileContentArgsSchema.parse({
          mode: "byte-range",
          path: "docs/notes.txt",
          byte_range: {
            endExclusive: 18,
            start: 6,
          },
        }),
      ),
    ).toEqual({
      byteCount: 12,
      mode: "byte_range",
      path: "docs/notes.txt",
      startByte: 6,
    });

    expect(
      normalizeReadFileContentArgs(
        ReadFileContentArgsSchema.parse({
          mode: "chunk-cursor",
          path: "docs/notes.txt",
        }),
      ),
    ).toEqual({
      byteCount: READ_FILE_CONTENT_BYTE_RANGE_DEFAULT_BYTES,
      cursor: null,
      mode: "chunk_cursor",
      path: "docs/notes.txt",
    });
  });

  it("returns the structured full-read result for small inline content reads", async () => {
    const result = await getReadFileContentResult(
      {
        mode: "full",
        path: "docs/notes.txt",
      },
      ["C:/allowed"],
    );

    expect(mockedReadFile).toHaveBeenCalledWith(
      "C:/allowed/docs/notes.txt",
      "utf8",
    );
    expect(mockedAssertProjectedTextBudget).toHaveBeenCalledWith(
      READ_FILE_CONTENT_TOOL_NAME,
      13,
      expect.any(Number),
      "Projected inline full content read exceeds the bounded full-read ceiling.",
      "Switch to `line_range`, `byte_range`, or `chunk_cursor` for larger files.",
    );
    expect(result).toEqual({
      content: "hello world!\n",
      encoding: "utf-8",
      hasMore: false,
      mode: "full",
      path: "docs/notes.txt",
      returnedByteCount: 13,
      totalFileBytes: 13,
    });
  });

  it("returns the structured byte-range result with explicit continuation offsets", async () => {
    const result = await getReadFileContentResult(
      {
        byteCount: 12,
        mode: "byte_range",
        path: "docs/notes.txt",
        startByte: 0,
      },
      ["C:/allowed"],
    );

    expect(mockedReadFileContentByteRange).toHaveBeenCalledWith(
      expect.objectContaining({
        byteCount: 12,
        startByte: 0,
        totalFileBytes: 13,
        validPath: "C:/allowed/docs/notes.txt",
      }),
    );
    expect(result).toEqual({
      content: "hello world!",
      endByteExclusive: 12,
      hasMore: true,
      mode: "byte_range",
      nextByteOffset: 12,
      path: "docs/notes.txt",
      returnedByteCount: 12,
      startByte: 0,
      totalFileBytes: 13,
    });
  });

  it("formats line-range reads with explicit continuation metadata", async () => {
    const output = await handleReadFileContent(
      {
        lineCount: 2,
        mode: "line_range",
        path: "docs/notes.txt",
        startLine: 1,
      },
      ["C:/allowed"],
    );

    expect(mockedReadFileContentLineRange).toHaveBeenCalledWith(
      expect.objectContaining({
        lineCount: 2,
        startLine: 1,
        validPath: "C:/allowed/docs/notes.txt",
      }),
    );
    expect(output).toContain("mode: line_range");
    expect(output).toContain("returnedLineCount: 2");
    expect(output).toContain("nextLine: 3");
    expect(output).toContain("1: line one");
  });

  it("formats cursor-based reads with explicit continuation metadata", async () => {
    const output = await handleReadFileContent(
      {
        byteCount: 12,
        cursor: "cursor-1",
        mode: "chunk_cursor",
        path: "docs/notes.txt",
      },
      ["C:/allowed"],
    );

    expect(mockedReadFileContentChunkCursor).toHaveBeenCalledWith({
      byteCount: 12,
      cursor: "cursor-1",
      totalFileBytes: 13,
      validPath: "C:/allowed/docs/notes.txt",
    });
    expect(output).toContain("mode: chunk_cursor");
    expect(output).toContain("cursor: cursor-1");
    expect(output).toContain("nextCursor: cursor-2");
    expect(mockedAssertActualTextBudget).toHaveBeenCalledWith(
      READ_FILE_CONTENT_TOOL_NAME,
      expect.any(Number),
      expect.any(Number),
      "Actual content-read response exceeds the direct-read family cap.",
    );
  });
});
