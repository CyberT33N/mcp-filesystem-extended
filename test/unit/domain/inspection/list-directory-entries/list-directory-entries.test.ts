import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getListDirectoryEntriesResult } from "@domain/inspection/list-directory-entries/handler";
import { ListDirectoryEntriesArgsSchema } from "@domain/inspection/list-directory-entries/schema";
import { DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION } from "@domain/inspection/shared/filesystem-entry-metadata-contract";

describe("list_directory_entries", () => {
  let sandboxRootPath = "";
  let allowedDirectories: string[] = [];
  let nestedDirectoryPath = "";
  let sampleFilePath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(
      join(tmpdir(), "mcp-fs-list-directory-entries-"),
    );
    allowedDirectories = [sandboxRootPath];
    nestedDirectoryPath = join(sandboxRootPath, "nested");
    sampleFilePath = join(nestedDirectoryPath, "sample.txt");

    await mkdir(nestedDirectoryPath, { recursive: true });
    await writeFile(sampleFilePath, "sample");
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("defaults recursive traversal and grouped metadata selection for base requests", () => {
    const parsed = ListDirectoryEntriesArgsSchema.parse({
      roots: [sandboxRootPath],
    });

    expect(parsed.recursive).toBe(false);
    expect(parsed.metadata).toEqual(
      DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
    );
    expect(parsed.excludeGlobs).toEqual([]);
    expect(parsed.includeExcludedGlobs).toEqual([]);
  });

  it("returns recursive structured entries with inline resume metadata for small listings", async () => {
    const result = await getListDirectoryEntriesResult(
      undefined,
      undefined,
      [sandboxRootPath],
      true,
      DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
      [],
      [],
      false,
      allowedDirectories,
    );

    const root = result.roots[0];

    if (root === undefined) {
      throw new Error("Expected one listing root for the requested sandbox path.");
    }

    const nestedEntry = root.entries.find((entry) => entry.path === "nested");
    const sampleEntry = nestedEntry?.children?.[0];

    expect(root.requestedPath).toBe(sandboxRootPath);
    expect(nestedEntry?.type).toBe("directory");
    expect(sampleEntry?.path).toBe("nested/sample.txt");
    expect(sampleEntry?.type).toBe("file");
    expect(result.resume.resumable).toBe(false);
    expect(result.resume.resumeToken).toBeNull();
  });

  it("includes grouped timestamp and permission metadata when requested", async () => {
    const result = await getListDirectoryEntriesResult(
      undefined,
      undefined,
      [sandboxRootPath],
      false,
      { permissions: true, timestamps: true },
      [],
      [],
      false,
      allowedDirectories,
    );

    const root = result.roots[0];
    const nestedEntry = root?.entries.find((entry) => entry.path === "nested");

    expect(nestedEntry?.created).toEqual(expect.any(String));
    expect(nestedEntry?.modified).toEqual(expect.any(String));
    expect(nestedEntry?.accessed).toEqual(expect.any(String));
    expect(nestedEntry?.permissions).toEqual(expect.any(String));
  });
});
