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
  mockedReadFileEndsWithNewline,
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
  mockedReadFileEndsWithNewline: vi.fn(),
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
  readFileEndsWithNewline: mockedReadFileEndsWithNewline,
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
    mockedReadFile.mockResolvedValue(Buffer.from("hello world!\n"));
    mockedReadFileEndsWithNewline.mockResolvedValue(true);
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
      encoding: "utf8",
      endsWithNewline: true,
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
      endsWithNewline: true,
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
    expect(output).toContain("endsWithNewline: true");
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
      textEncoding: "utf8",
    });
    expect(output).toContain("mode: chunk_cursor");
    expect(output).toContain("cursor: cursor-1");
    expect(output).toContain("nextCursor: cursor-2");
    expect(output).toContain("endsWithNewline: true");
    expect(mockedAssertActualTextBudget).toHaveBeenCalledWith(
      READ_FILE_CONTENT_TOOL_NAME,
      expect.any(Number),
      expect.any(Number),
      "Actual content-read response exceeds the direct-read family cap.",
    );
  });

  it("normalizes full-mode requests into the canonical contract", () => {
    expect(
      normalizeReadFileContentArgs(
        ReadFileContentArgsSchema.parse({
          mode: "full",
          path: "docs/notes.txt",
        }),
      ),
    ).toEqual({
      mode: "full",
      path: "docs/notes.txt",
    });
  });

  it("normalizes an explicit line-range window into a derived line count", () => {
    expect(
      normalizeReadFileContentArgs(
        ReadFileContentArgsSchema.parse({
          line_range: { end: 7, start: 3 },
          mode: "line-range",
          path: "docs/notes.txt",
        }),
      ),
    ).toEqual({
      lineCount: 5,
      mode: "line_range",
      path: "docs/notes.txt",
      startLine: 3,
    });
  });

  it("normalizes byte-range requests that carry only an explicit byte count", () => {
    expect(
      normalizeReadFileContentArgs(
        ReadFileContentArgsSchema.parse({
          byte_range: { byteCount: 4, start: 6 },
          mode: "byte-range",
          path: "docs/notes.txt",
        }),
      ),
    ).toEqual({
      byteCount: 4,
      mode: "byte_range",
      path: "docs/notes.txt",
      startByte: 6,
    });
  });

  it("normalizes explicit chunk-cursor windows into the canonical contract", () => {
    expect(
      normalizeReadFileContentArgs(
        ReadFileContentArgsSchema.parse({
          chunk_cursor: { byteCount: 64, cursor: "cursor-9" },
          mode: "chunk-cursor",
          path: "docs/notes.txt",
        }),
      ),
    ).toEqual({
      byteCount: 64,
      cursor: "cursor-9",
      mode: "chunk_cursor",
      path: "docs/notes.txt",
    });
  });

  it("rejects line-range windows whose end precedes the start", () => {
    expect(() =>
      ReadFileContentArgsSchema.parse({
        line_range: { end: 2, start: 5 },
        mode: "line-range",
        path: "docs/notes.txt",
      })
    ).toThrow("must be greater than or equal to");
  });

  it("rejects line-range windows beyond the hard maximum line window", () => {
    expect(() =>
      ReadFileContentArgsSchema.parse({
        line_range: { end: 2001, start: 1 },
        mode: "line-range",
        path: "docs/notes.txt",
      })
    ).toThrow("exceeds the hard maximum line window");
  });

  it("rejects byte-range requests that mix an exclusive end with a byte count", () => {
    expect(() =>
      ReadFileContentArgsSchema.parse({
        byte_range: { byteCount: 5, endExclusive: 10, start: 0 },
        mode: "byte-range",
        path: "docs/notes.txt",
      })
    ).toThrow("not both");
  });

  it("rejects byte-range windows whose end does not exceed the start", () => {
    expect(() =>
      ReadFileContentArgsSchema.parse({
        byte_range: { endExclusive: 10, start: 10 },
        mode: "byte-range",
        path: "docs/notes.txt",
      })
    ).toThrow("must be greater than");
  });

  it("rejects byte-range windows beyond the hard maximum byte window", () => {
    expect(() =>
      ReadFileContentArgsSchema.parse({
        byte_range: { endExclusive: 1024 * 1024 + 1, start: 0 },
        mode: "byte-range",
        path: "docs/notes.txt",
      })
    ).toThrow("exceeds the hard maximum byte window");
  });

  it("accepts an explicit line-range start without an end line", () => {
    expect(
      normalizeReadFileContentArgs(
        ReadFileContentArgsSchema.parse({
          line_range: { start: 3 },
          mode: "line-range",
          path: "docs/notes.txt",
        }),
      ),
    ).toEqual({
      lineCount: READ_FILE_CONTENT_LINE_RANGE_DEFAULT_LINES,
      mode: "line_range",
      path: "docs/notes.txt",
      startLine: 3,
    });
  });

  it("applies the canonical window defaults for flat requests without option blocks", () => {
    expect(
      normalizeReadFileContentArgs({ mode: "chunk-cursor", path: "docs/notes.txt" }),
    ).toEqual({
      byteCount: READ_FILE_CONTENT_BYTE_RANGE_DEFAULT_BYTES,
      cursor: null,
      mode: "chunk_cursor",
      path: "docs/notes.txt",
    });

    expect(
      normalizeReadFileContentArgs({ mode: "line-range", path: "docs/notes.txt" }),
    ).toEqual({
      lineCount: READ_FILE_CONTENT_LINE_RANGE_DEFAULT_LINES,
      mode: "line_range",
      path: "docs/notes.txt",
      startLine: 1,
    });

    expect(
      normalizeReadFileContentArgs({ mode: "byte-range", path: "docs/notes.txt" }),
    ).toEqual({
      byteCount: READ_FILE_CONTENT_BYTE_RANGE_DEFAULT_BYTES,
      mode: "byte_range",
      path: "docs/notes.txt",
      startByte: 0,
    });
  });

  it("formats full-mode reads with the line-numbered content surface", async () => {
    const output = await handleReadFileContent(
      { mode: "full", path: "docs/notes.txt" },
      ["C:/allowed"],
    );

    expect(output).toContain("mode: full");
    expect(output).toContain("encoding: utf8");
    expect(output).toContain("totalFileBytes: 13");
    expect(output).toContain("1: hello world!");
  });

  it("formats byte-range reads with explicit byte offsets", async () => {
    const output = await handleReadFileContent(
      { byteCount: 12, mode: "byte_range", path: "docs/notes.txt", startByte: 0 },
      ["C:/allowed"],
    );

    expect(output).toContain("mode: byte_range");
    expect(output).toContain("startByte: 0");
    expect(output).toContain("endByteExclusive: 12");
    expect(output).toContain("nextByteOffset: 12");
    expect(output).toContain("hello world!");
  });

  it("formats null continuation markers for terminal ranged reads", async () => {
    mockedReadFileContentLineRange.mockResolvedValueOnce({
      content: "line one\n",
      endLine: 1,
      hasMore: false,
      nextLine: null,
      returnedByteCount: 9,
      returnedLineCount: 1,
      startLine: 1,
    });
    const lineOutput = await handleReadFileContent(
      { lineCount: 1, mode: "line_range", path: "docs/notes.txt", startLine: 1 },
      ["C:/allowed"],
    );
    expect(lineOutput).toContain("nextLine: null");

    mockedReadFileContentByteRange.mockResolvedValueOnce({
      content: "hello",
      endByteExclusive: 5,
      hasMore: false,
      nextByteOffset: null,
      returnedByteCount: 5,
      startByte: 0,
    });
    const byteOutput = await handleReadFileContent(
      { byteCount: 5, mode: "byte_range", path: "docs/notes.txt", startByte: 0 },
      ["C:/allowed"],
    );
    expect(byteOutput).toContain("nextByteOffset: null");

    mockedReadFileContentChunkCursor.mockResolvedValueOnce({
      content: "chunk",
      cursor: null,
      endByteExclusive: 5,
      hasMore: false,
      nextCursor: null,
      returnedByteCount: 5,
      startByte: 0,
    });
    const cursorOutput = await handleReadFileContent(
      { byteCount: 5, cursor: null, mode: "chunk_cursor", path: "docs/notes.txt" },
      ["C:/allowed"],
    );
    expect(cursorOutput).toContain("cursor: null");
    expect(cursorOutput).toContain("nextCursor: null");
  });

  it("rejects inline full reads when the projected read window exceeds the runtime comfort budget", async () => {
    mockedDetectIoCapabilityProfile.mockReturnValue({
      ...TEST_IO_CAPABILITY_PROFILE,
      estimatedSourceReadBytesPerSecond: 0.1,
    });

    await expect(
      getReadFileContentResult({ mode: "full", path: "docs/notes.txt" }, ["C:/allowed"]),
    ).rejects.toThrow("exceeds the shared runtime comfort budget");
  });

  it("skips the comfort-window guard when the runtime read rate is unknown or zero", async () => {
    mockedDetectIoCapabilityProfile.mockReturnValue({
      ...TEST_IO_CAPABILITY_PROFILE,
      estimatedSourceReadBytesPerSecond: null,
    });

    const unknownRateResult = await getReadFileContentResult(
      { mode: "full", path: "docs/notes.txt" },
      ["C:/allowed"],
    );
    expect(unknownRateResult.mode).toBe("full");

    mockedDetectIoCapabilityProfile.mockReturnValue({
      ...TEST_IO_CAPABILITY_PROFILE,
      estimatedSourceReadBytesPerSecond: 0,
    });

    const zeroRateResult = await getReadFileContentResult(
      { mode: "full", path: "docs/notes.txt" },
      ["C:/allowed"],
    );
    expect(zeroRateResult.mode).toBe("full");
  });

  it("fails closed when preflight returns no validated entry", async () => {
    mockedCollectValidatedFilesystemPreflightEntries.mockResolvedValue([]);

    await expect(
      getReadFileContentResult({ mode: "full", path: "docs/notes.txt" }, ["C:/allowed"]),
    ).rejects.toThrow("Expected one validated file entry");
  });
});
