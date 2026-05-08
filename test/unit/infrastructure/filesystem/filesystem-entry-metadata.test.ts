import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION } from "@domain/inspection/shared/filesystem-entry-metadata-contract";
import { getFileSystemEntryMetadata } from "@infrastructure/filesystem/filesystem-entry-metadata";

describe("getFileSystemEntryMetadata", () => {
  let sandboxRootPath = "";
  let sampleDirectoryPath = "";
  let sampleFilePath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-entry-metadata-"));
    sampleDirectoryPath = join(sandboxRootPath, "nested");
    sampleFilePath = join(sampleDirectoryPath, "sample.txt");

    await mkdir(sampleDirectoryPath, { recursive: true });
    await writeFile(sampleFilePath, "abc", "utf8");
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("returns only required metadata when callers use the default selection", async () => {
    const metadata = await getFileSystemEntryMetadata(
      sampleFilePath,
      DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
    );

    expect(metadata).toEqual({
      type: "file",
      size: 3,
    });
  });

  it("includes grouped timestamps and permissions when requested", async () => {
    const directoryStats = await stat(sampleDirectoryPath);
    const metadata = await getFileSystemEntryMetadata(sampleDirectoryPath, {
      timestamps: true,
      permissions: true,
    });

    expect(metadata).toEqual({
      type: "directory",
      size: directoryStats.size,
      created: directoryStats.birthtime.toISOString(),
      modified: directoryStats.mtime.toISOString(),
      accessed: directoryStats.atime.toISOString(),
      permissions: directoryStats.mode.toString(8).slice(-3),
    });
  });
});
