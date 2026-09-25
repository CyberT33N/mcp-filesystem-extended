import { mkdir, mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises";
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

  it("reports a file symlink with its resolved target and its own link metadata", async () => {
    const aliasPath = join(sandboxRootPath, "alias.txt");
    await symlink(sampleFilePath, aliasPath, "file");

    const metadata = await getFileSystemEntryMetadata(
      aliasPath,
      DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
    );

    expect(metadata.type).toBe("symlink");
    expect(metadata.linkTarget).toBe(sampleFilePath);
    expect(metadata.size).not.toBe(3);
  });

  it("reports a directory junction as a symlink with its resolved target", async () => {
    const junctionPath = join(sandboxRootPath, "nested-alias");
    await symlink(sampleDirectoryPath, junctionPath, "junction");

    const metadata = await getFileSystemEntryMetadata(
      junctionPath,
      DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
    );

    expect(metadata.type).toBe("symlink");
    expect(metadata.linkTarget).toBe(sampleDirectoryPath);
  });

  it("reports a dangling symlink with its resolved target", async () => {
    const missingTargetPath = join(sandboxRootPath, "missing-target.txt");
    const danglingPath = join(sandboxRootPath, "dangling.txt");
    await symlink(missingTargetPath, danglingPath, "file");

    const metadata = await getFileSystemEntryMetadata(
      danglingPath,
      DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
    );

    expect(metadata.type).toBe("symlink");
    expect(metadata.linkTarget).toBe(missingTargetPath);
  });

  it("includes grouped metadata for a symlink when requested", async () => {
    const aliasPath = join(sandboxRootPath, "alias.txt");
    await symlink(sampleFilePath, aliasPath, "file");

    const metadata = await getFileSystemEntryMetadata(aliasPath, {
      timestamps: true,
      permissions: true,
    });

    expect(metadata.type).toBe("symlink");
    expect(metadata.linkTarget).toBe(sampleFilePath);
    expect(metadata.created).toEqual(expect.any(String));
    expect(metadata.modified).toEqual(expect.any(String));
    expect(metadata.accessed).toEqual(expect.any(String));
    expect(metadata.permissions).toEqual(expect.any(String));
  });
});
