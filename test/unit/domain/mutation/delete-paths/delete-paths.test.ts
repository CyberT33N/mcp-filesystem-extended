import { access, lstat, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handleDeletePaths } from "@domain/mutation/delete-paths/handler";
import { DeletePathsArgsSchema } from "@domain/mutation/delete-paths/schema";
import { MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST } from "@domain/shared/guardrails/tool-guardrail-limits";

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

  it("deletes a file symlink without touching its target", async () => {
    const linkPath = join(sandboxRootPath, "alias.txt");
    await symlink(sampleFilePath, linkPath, "file");

    const output = await handleDeletePaths([linkPath], false, allowedDirectories);

    expect(output).toContain("1 paths processed successfully");
    await expect(lstat(linkPath)).rejects.toThrow();
    expect(await readFile(sampleFilePath, "utf8")).toBe("temporary");
  });

  it("deletes a directory junction without touching the target directory", async () => {
    const junctionPath = join(sandboxRootPath, "nested-alias");
    await symlink(sampleDirectoryPath, junctionPath, "junction");

    const output = await handleDeletePaths([junctionPath], false, allowedDirectories);

    expect(output).toContain("1 paths processed successfully");
    await expect(lstat(junctionPath)).rejects.toThrow();
    expect((await stat(sampleDirectoryPath)).isDirectory()).toBe(true);
    expect(await readFile(join(sampleDirectoryPath, "child.txt"), "utf8")).toBe("nested");
  });

  it("deletes a dangling symlink", async () => {
    const danglingPath = join(sandboxRootPath, "dangling.txt");
    await symlink(join(sandboxRootPath, "missing-target.txt"), danglingPath, "file");

    const output = await handleDeletePaths([danglingPath], false, allowedDirectories);

    expect(output).toContain("1 paths processed successfully");
    await expect(lstat(danglingPath)).rejects.toThrow();
  });

  it("reports a failure entry when the target does not exist", async () => {
    const output = await handleDeletePaths(
      [join(sandboxRootPath, "missing.txt")],
      false,
      allowedDirectories,
    );

    expect(output).toContain("Failed to delete");
  });

  it("reports a failure entry when the target is outside the allowed roots", async () => {
    const output = await handleDeletePaths(
      [join(sandboxRootPath, "..", "outside.txt")],
      false,
      allowedDirectories,
    );

    expect(output).toContain("Failed to delete");
    expect(output).toContain("Access denied");
  });

  it("refuses delete batches beyond the shared path-mutation budget", async () => {
    const oversizedPaths = Array.from(
      { length: MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST + 1 },
      (_, index) => join(sandboxRootPath, `target-${index}.txt`),
    );

    const output = await handleDeletePaths(oversizedPaths, false, allowedDirectories);

    expect(output).toContain("delete_paths");
    expect(output).not.toContain("paths processed successfully");
  });

  it("defaults the recursive deletion flag to false in the schema", () => {
    const parsed = DeletePathsArgsSchema.parse({
      paths: ["temp.txt"],
    });

    expect(parsed.recursive).toBe(false);
  });
});
