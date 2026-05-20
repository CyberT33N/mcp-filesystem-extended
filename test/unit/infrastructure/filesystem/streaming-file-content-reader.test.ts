import { Buffer } from "node:buffer";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  readFileEndsWithNewline,
  readFileContentByteRange,
  readFileContentChunkCursor,
  readFileContentLineRange,
} from "@infrastructure/filesystem/streaming-file-content-reader";

describe("streaming_file_content_reader", () => {
  let sandboxRootPath = "";
  let utf8FilePath = "";
  let utf16FilePath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-streaming-read-core-"));
    utf8FilePath = join(sandboxRootPath, "sample.txt");
    utf16FilePath = join(sandboxRootPath, "sample-utf16.txt");
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("returns bounded line windows with continuation metadata", async () => {
    const fileContent = ["alpha", "beta", "gamma", "delta"].join("\n");
    await writeFile(utf8FilePath, fileContent, "utf8");

    const result = await readFileContentLineRange({
      validPath: utf8FilePath,
      startLine: 2,
      lineCount: 2,
      textEncoding: "utf8",
    });

    expect(result).toEqual({
      content: "beta\ngamma",
      startLine: 2,
      endLine: 3,
      returnedLineCount: 2,
      returnedByteCount: Buffer.byteLength("beta\ngamma", "utf8"),
      hasMore: true,
      nextLine: 4,
    });
  });

  it("truncates line windows at EOF when the start line is valid", async () => {
    const fileContent = "alpha\nbeta\ngamma\n";
    await writeFile(utf8FilePath, fileContent, "utf8");

    const result = await readFileContentLineRange({
      validPath: utf8FilePath,
      startLine: 3,
      lineCount: 5,
      textEncoding: "utf8",
    });

    expect(result).toEqual({
      content: "gamma",
      startLine: 3,
      endLine: 3,
      returnedLineCount: 1,
      returnedByteCount: Buffer.byteLength("gamma", "utf8"),
      hasMore: false,
      nextLine: null,
    });
  });

  it("rejects line windows whose start line is beyond EOF", async () => {
    await writeFile(utf8FilePath, "alpha\nbeta\n", "utf8");

    await expect(
      readFileContentLineRange({
        validPath: utf8FilePath,
        startLine: 3,
        lineCount: 1,
        textEncoding: "utf8",
      }),
    ).rejects.toThrow(
      "Requested startLine 3 is outside the file because the file has 2 addressable lines.",
    );
  });

  it("returns bounded byte windows with the next unread byte offset", async () => {
    const fileContent = "alpha\nbeta\n";
    await writeFile(utf8FilePath, fileContent, "utf8");

    const result = await readFileContentByteRange({
      validPath: utf8FilePath,
      totalFileBytes: Buffer.byteLength(fileContent, "utf8"),
      startByte: 6,
      byteCount: 4,
      textEncoding: "utf8",
    });

    expect(result).toEqual({
      content: "beta",
      returnedByteCount: 4,
      startByte: 6,
      endByteExclusive: 10,
      hasMore: true,
      nextByteOffset: 10,
    });
  });

  it("rejects byte windows whose start byte is beyond EOF", async () => {
    const fileContent = "alpha";
    await writeFile(utf8FilePath, fileContent, "utf8");

    await expect(
      readFileContentByteRange({
        validPath: utf8FilePath,
        totalFileBytes: Buffer.byteLength(fileContent, "utf8"),
        startByte: 5,
        byteCount: 1,
        textEncoding: "utf8",
      }),
    ).rejects.toThrow(
      "Requested startByte 5 is outside the file because totalFileBytes is 5. Retry with startByte between 0 and 4.",
    );
  });

  it("rejects utf16le byte windows that are not code-unit aligned", async () => {
    const fileContent = "alpha";
    const encodedFile = Buffer.from(fileContent, "utf16le");
    await writeFile(utf16FilePath, encodedFile);

    await expect(
      readFileContentByteRange({
        validPath: utf16FilePath,
        totalFileBytes: encodedFile.byteLength,
        startByte: 1,
        byteCount: 2,
        textEncoding: "utf16le",
      }),
    ).rejects.toThrow(
      "UTF-16 LE byte-oriented reads require an even startByte so decoding remains code-unit aligned.",
    );

    await expect(
      readFileContentByteRange({
        validPath: utf16FilePath,
        totalFileBytes: encodedFile.byteLength,
        startByte: 0,
        byteCount: 3,
        textEncoding: "utf16le",
      }),
    ).rejects.toThrow(
      "UTF-16 LE byte-oriented reads require an even byteCount so decoding remains code-unit aligned.",
    );
  });

  it("reads cursor chunks and exposes an opaque continuation cursor", async () => {
    const fileContent = "alpha\nbeta";
    await writeFile(utf8FilePath, fileContent, "utf8");

    const firstChunk = await readFileContentChunkCursor({
      validPath: utf8FilePath,
      totalFileBytes: Buffer.byteLength(fileContent, "utf8"),
      cursor: null,
      byteCount: 6,
      textEncoding: "utf8",
    });

    expect(firstChunk).toEqual({
      content: "alpha\n",
      returnedByteCount: 6,
      cursor: null,
      nextCursor: "cursor:6",
      startByte: 0,
      endByteExclusive: 6,
      hasMore: true,
    });

    const secondChunk = await readFileContentChunkCursor({
      validPath: utf8FilePath,
      totalFileBytes: Buffer.byteLength(fileContent, "utf8"),
      cursor: firstChunk.nextCursor,
      byteCount: 32,
      textEncoding: "utf8",
    });

    expect(secondChunk).toEqual({
      content: "beta",
      returnedByteCount: 4,
      cursor: "cursor:6",
      nextCursor: null,
      startByte: 6,
      endByteExclusive: 10,
      hasMore: false,
    });
  });

  it("rejects chunk cursors whose decoded offset is beyond EOF", async () => {
    const fileContent = "alpha";
    await writeFile(utf8FilePath, fileContent, "utf8");

    await expect(
      readFileContentChunkCursor({
        validPath: utf8FilePath,
        totalFileBytes: Buffer.byteLength(fileContent, "utf8"),
        cursor: "cursor:5",
        byteCount: 1,
        textEncoding: "utf8",
      }),
    ).rejects.toThrow(
      "Requested cursor byte offset 5 is outside the file because totalFileBytes is 5. Retry with cursor byte offset between 0 and 4.",
    );
  });

  it("rejects cursors that do not use the expected prefix", async () => {
    const fileContent = "alpha";
    await writeFile(utf8FilePath, fileContent, "utf8");

    await expect(
      readFileContentChunkCursor({
        validPath: utf8FilePath,
        totalFileBytes: Buffer.byteLength(fileContent, "utf8"),
        cursor: "offset:4",
        byteCount: 4,
        textEncoding: "utf8",
      }),
    ).rejects.toThrow(
      "Chunk cursor is invalid because it does not use the expected cursor prefix.",
    );
  });

  it("detects whether the validated text file ends with a newline terminator", async () => {
    await writeFile(utf8FilePath, "alpha\nbeta\n", "utf8");

    await expect(
      readFileEndsWithNewline(
        utf8FilePath,
        Buffer.byteLength("alpha\nbeta\n", "utf8"),
        "utf8",
      ),
    ).resolves.toBe(true);

    await writeFile(utf8FilePath, "alpha\nbeta", "utf8");

    await expect(
      readFileEndsWithNewline(
        utf8FilePath,
        Buffer.byteLength("alpha\nbeta", "utf8"),
        "utf8",
      ),
    ).resolves.toBe(false);
  });
});
