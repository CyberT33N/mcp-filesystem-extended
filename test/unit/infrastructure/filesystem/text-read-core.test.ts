import { Buffer } from "node:buffer";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_BYTES,
  INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_POSITIONS,
  INSPECTION_CONTENT_STATE_UNKNOWN_LARGE_SURFACE_MIN_BYTES,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import { INSPECTION_CONTENT_STATE_LITERALS } from "@domain/shared/search/inspection-content-state";
import {
  assertSupportedTextReadSurface,
  formatLineNumberedTextContent,
  readDecodedInspectionTextFile,
  readSharedInspectionContentSample,
  readValidatedFullTextFile,
  resolveTextReadInspectionState,
} from "@infrastructure/filesystem/text-read-core";

describe("text_read_core", () => {
  let sandboxRootPath = "";
  let utf8FilePath = "";
  let largeTextFilePath = "";
  let utf16FilePath = "";
  let binaryFilePath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-text-read-core-"));
    utf8FilePath = join(sandboxRootPath, "sample.txt");
    largeTextFilePath = join(sandboxRootPath, "large.txt");
    utf16FilePath = join(sandboxRootPath, "sample-utf16.txt");
    binaryFilePath = join(sandboxRootPath, "sample.bin");
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("returns full coverage samples for small text surfaces", async () => {
    const fileBuffer = Buffer.from("alpha\nbeta\n", "utf8");
    await writeFile(utf8FilePath, fileBuffer);

    const sample = await readSharedInspectionContentSample(utf8FilePath, fileBuffer.byteLength);

    expect(Buffer.from(sample.contentSample)).toEqual(fileBuffer);
    expect(sample.sampledWindowPositions).toEqual(
      INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_POSITIONS,
    );
  });

  it("returns bounded head-middle-tail samples for large text surfaces", async () => {
    const fileContent = "a".repeat(
      INSPECTION_CONTENT_STATE_UNKNOWN_LARGE_SURFACE_MIN_BYTES + 128,
    );
    await writeFile(largeTextFilePath, fileContent, "utf8");

    const sample = await readSharedInspectionContentSample(
      largeTextFilePath,
      Buffer.byteLength(fileContent, "utf8"),
    );

    expect(sample.contentSample.byteLength).toBe(
      INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_BYTES
        * INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_POSITIONS.length,
    );
    expect(sample.sampledWindowPositions).toEqual(
      INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_POSITIONS,
    );
  });

  it("detects utf16le text surfaces and reuses the resolved encoding for validated reads", async () => {
    const fileContent = "alpha\nbeta";
    const encodedFile = Buffer.from(fileContent, "utf16le");
    await writeFile(utf16FilePath, encodedFile);

    const entry = {
      requestedPath: utf16FilePath,
      validPath: utf16FilePath,
      totalFileBytes: encodedFile.byteLength,
    };

    const classification = await resolveTextReadInspectionState(entry);

    expect(classification.resolvedState).toBe(
      INSPECTION_CONTENT_STATE_LITERALS.TEXT_CONFIDENT,
    );
    expect(classification.resolvedTextEncoding).toBe("utf16le");

    const result = await readValidatedFullTextFile(entry, "read_file_content", classification);

    expect(result.content).toBe(fileContent);
    expect(result.returnedByteCount).toBe(encodedFile.byteLength);
    expect(result.classification).toBe(classification);
  });

  it("rejects binary-confident surfaces before decoded text reads proceed", async () => {
    const binaryContent = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]);
    await writeFile(binaryFilePath, binaryContent);

    const entry = {
      requestedPath: binaryFilePath,
      validPath: binaryFilePath,
      totalFileBytes: binaryContent.byteLength,
    };

    const classification = await resolveTextReadInspectionState(entry);

    expect(classification.resolvedState).toBe(
      INSPECTION_CONTENT_STATE_LITERALS.BINARY_CONFIDENT,
    );
    expect(() =>
      assertSupportedTextReadSurface(
        "read_file_content",
        { requestedPath: binaryFilePath },
        classification,
      )
    ).toThrow("supports only text-compatible reads");
    await expect(
      readValidatedFullTextFile(entry, "read_file_content", classification),
    ).rejects.toThrow("supports only text-compatible reads");
  });

  it("decodes shared text surfaces with the caller-provided encoding", async () => {
    const fileContent = "streaming core";
    const fileBuffer = Buffer.from(fileContent, "utf16le");
    await writeFile(utf16FilePath, fileBuffer);

    const result = await readDecodedInspectionTextFile(utf16FilePath, "utf16le");

    expect(result).toEqual({
      content: fileContent,
      returnedByteCount: fileBuffer.byteLength,
    });
  });

  it("formats absolute line numbers for emitted text surfaces", () => {
    expect(formatLineNumberedTextContent("alpha\nbeta", 4)).toBe("4: alpha\n5: beta");
  });
});
