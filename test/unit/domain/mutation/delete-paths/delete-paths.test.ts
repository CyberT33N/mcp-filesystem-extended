import { access, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handleDeletePaths } from "@domain/mutation/delete-paths/handler";
import { DeletePathsArgsSchema } from "@domain/mutation/delete-paths/schema";

describe("delete_paths", () => {
  let sandboxRootPath = "";
  let allowedDirectories: string[] = [];
  let sampleFilePath = "";
  let sampleDirectoryPath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-delete-paths-"));
    allowedDirectories = [sandboxRootPath];
    sampleFilePath = join(sandboxRootPath, "sample.txt");
    sampleDirectoryPath = join(sandboxRootPath, "nested");

    await writeFile(sampleFilePath, "temporary", "utf8");
    await mkdir(sampleDirectoryPath, { recursive: true });
    await writeFile(join(sampleDirectoryPath, "child.txt"), "nested", "utf8");
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("deletes individual files inside the allowed roots", async () => {
    await handleDeletePaths([sampleFilePath], false, allowedDirectories);

    await expect(access(sampleFilePath)).rejects.toThrow();
  });

  it("requires the recursive flag before deleting directories", async () => {
    const firstAttempt = await handleDeletePaths(
      [sampleDirectoryPath],
      false,
      allowedDirectories,
    );

    expect((await stat(sampleDirectoryPath)).isDirectory()).toBe(true);
    expect(firstAttempt).toContain("Cannot delete directory without recursive flag");

    await handleDeletePaths([sampleDirectoryPath], true, allowedDirectories);

    await expect(access(sampleDirectoryPath)).rejects.toThrow();
  });

  it("defaults the recursive deletion flag to false in the schema", () => {
    const parsed = DeletePathsArgsSchema.parse({
      paths: ["temp.txt"],
    });

    expect(parsed.recursive).toBe(false);
  });
});
