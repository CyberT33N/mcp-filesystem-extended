import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  getPathMetadataResult,
  handleGetPathMetadata,
} from "@domain/inspection/get-path-metadata/handler";
import { GetPathMetadataArgsSchema } from "@domain/inspection/get-path-metadata/schema";

describe("get_path_metadata", () => {
  let sandboxRootPath = "";
  let allowedDirectories: string[] = [];
  let sampleDirectoryPath = "";
  let sampleFilePath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-path-metadata-"));
    allowedDirectories = [sandboxRootPath];
    sampleDirectoryPath = join(sandboxRootPath, "nested");
    sampleFilePath = join(sampleDirectoryPath, "sample.txt");

    await mkdir(sampleDirectoryPath, { recursive: true });
    await writeFile(sampleFilePath, "abc");
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("returns structured metadata entries and preserves per-path lookup errors", async () => {
    const missingFilePath = join(sandboxRootPath, "missing.txt");
    const result = await getPathMetadataResult(
      [sampleFilePath, sampleDirectoryPath, missingFilePath],
      undefined,
      allowedDirectories,
    );

    const fileEntry = result.entries.find((entry) => entry.path === sampleFilePath);
    const directoryEntry = result.entries.find(
      (entry) => entry.path === sampleDirectoryPath,
    );
    const firstError = result.errors[0];

    expect(fileEntry).toBeDefined();
    expect(directoryEntry).toBeDefined();
    expect(firstError).toBeDefined();

    if (fileEntry === undefined || directoryEntry === undefined || firstError === undefined) {
      throw new Error("Expected file entry, directory entry, and one missing-path error.");
    }

    expect(fileEntry.type).toBe("file");
    expect(fileEntry.size).toBe(3);
    expect(directoryEntry.type).toBe("directory");
    expect(firstError.path).toBe(missingFilePath);
    expect(firstError.error.length).toBeGreaterThan(0);
  });

  it("formats single-path metadata output with the canonical text surface", async () => {
    const output = await handleGetPathMetadata(
      [sampleFilePath],
      undefined,
      allowedDirectories,
    );

    expect(output).toContain(`path: ${sampleFilePath}`);
    expect(output).toContain("size: 3 bytes");
    expect(output).toContain("type: file");
  });

  it("defaults grouped metadata selection when the request omits it", () => {
    const parsed = GetPathMetadataArgsSchema.parse({
      paths: [sampleFilePath],
    });

    expect(parsed.metadata.permissions).toBe(false);
    expect(parsed.metadata.timestamps).toBe(false);
  });
});
