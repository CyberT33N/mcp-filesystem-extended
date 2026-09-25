import { access, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleMovePaths } from "@domain/mutation/move-paths/handler";
import { MovePathsArgsSchema } from "@domain/mutation/move-paths/schema";
import { MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST } from "@domain/shared/guardrails/tool-guardrail-limits";

const lstatInjectionState = vi.hoisted(() => ({ codesByPath: new Map<string, string>() }));

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  const lstatWithInjection = async (targetPath: Parameters<typeof actual.lstat>[0]) => {
    const injectedCode = lstatInjectionState.codesByPath.get(String(targetPath));
    if (injectedCode !== undefined) {
      throw Object.assign(new Error(`injected lstat failure with code ${injectedCode}`), {
        code: injectedCode,
      });
    }
    return actual.lstat(targetPath);
  };
  return {
    ...actual,
    default: { ...actual, lstat: lstatWithInjection },
    lstat: lstatWithInjection,
  };
});

describe("move_paths", () => {
  let sandboxRootPath = "";
  let allowedDirectories: string[] = [];
  let sourceFilePath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-move-paths-"));
    allowedDirectories = [sandboxRootPath];
    sourceFilePath = join(sandboxRootPath, "draft.txt");

    await writeFile(sourceFilePath, "source payload", "utf8");
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("moves files and creates missing destination parents", async () => {
    const destinationFilePath = join(sandboxRootPath, "archive", "draft.txt");

    await handleMovePaths(
      [{ source: sourceFilePath, destination: destinationFilePath }],
      false,
      allowedDirectories,
    );

    await expect(access(sourceFilePath)).rejects.toThrow();
    expect(await readFile(destinationFilePath, "utf8")).toBe("source payload");
  });

  it("keeps the source intact when the destination exists and overwrite is false", async () => {
    const destinationFilePath = join(sandboxRootPath, "existing.txt");

    await writeFile(destinationFilePath, "already here", "utf8");

    const output = await handleMovePaths(
      [{ source: sourceFilePath, destination: destinationFilePath }],
      false,
      allowedDirectories,
    );

    expect(await readFile(sourceFilePath, "utf8")).toBe("source payload");
    expect(await readFile(destinationFilePath, "utf8")).toBe("already here");
    expect(output).toContain("Destination already exists");
  });

  it("moves a file symlink without touching its target", async () => {
    const linkPath = join(sandboxRootPath, "alias.txt");
    const movedLinkPath = join(sandboxRootPath, "moved-alias.txt");
    await symlink(sourceFilePath, linkPath, "file");

    await handleMovePaths(
      [{ source: linkPath, destination: movedLinkPath }],
      false,
      allowedDirectories,
    );

    await expect(lstat(linkPath)).rejects.toThrow();
    expect((await lstat(movedLinkPath)).isSymbolicLink()).toBe(true);
    expect(await readFile(movedLinkPath, "utf8")).toBe("source payload");
    expect(await readFile(sourceFilePath, "utf8")).toBe("source payload");
  });

  it("moves a directory junction without touching the target directory", async () => {
    const targetDirectoryPath = join(sandboxRootPath, "real-dir");
    await mkdir(targetDirectoryPath);
    await writeFile(join(targetDirectoryPath, "child.txt"), "child payload", "utf8");
    const junctionPath = join(sandboxRootPath, "dir-alias");
    const movedJunctionPath = join(sandboxRootPath, "moved-dir-alias");
    await symlink(targetDirectoryPath, junctionPath, "junction");

    await handleMovePaths(
      [{ source: junctionPath, destination: movedJunctionPath }],
      false,
      allowedDirectories,
    );

    await expect(lstat(junctionPath)).rejects.toThrow();
    expect((await lstat(movedJunctionPath)).isSymbolicLink()).toBe(true);
    expect(await readFile(join(targetDirectoryPath, "child.txt"), "utf8")).toBe("child payload");
    expect(await readFile(join(movedJunctionPath, "child.txt"), "utf8")).toBe("child payload");
  });

  it("removes only the destination symlink when overwrite replaces an alias", async () => {
    const otherFilePath = join(sandboxRootPath, "other.txt");
    await writeFile(otherFilePath, "other payload", "utf8");
    const destinationLinkPath = join(sandboxRootPath, "destination-alias.txt");
    await symlink(otherFilePath, destinationLinkPath, "file");

    await handleMovePaths(
      [{ source: sourceFilePath, destination: destinationLinkPath }],
      true,
      allowedDirectories,
    );

    expect(await readFile(destinationLinkPath, "utf8")).toBe("source payload");
    expect((await lstat(destinationLinkPath)).isSymbolicLink()).toBe(false);
    expect(await readFile(otherFilePath, "utf8")).toBe("other payload");
  });

  it("requires overwrite when the destination is occupied by a dangling symlink", async () => {
    const danglingDestinationPath = join(sandboxRootPath, "dangling-destination.txt");
    await symlink(join(sandboxRootPath, "missing-target.txt"), danglingDestinationPath, "file");

    const output = await handleMovePaths(
      [{ source: sourceFilePath, destination: danglingDestinationPath }],
      false,
      allowedDirectories,
    );

    expect(output).toContain("Destination already exists");
    expect((await lstat(danglingDestinationPath)).isSymbolicLink()).toBe(true);
    expect(await readFile(sourceFilePath, "utf8")).toBe("source payload");
  });

  it("moves a dangling source symlink", async () => {
    const danglingSourcePath = join(sandboxRootPath, "dangling-source.txt");
    const movedDanglingPath = join(sandboxRootPath, "moved-dangling.txt");
    await symlink(join(sandboxRootPath, "missing-target.txt"), danglingSourcePath, "file");

    await handleMovePaths(
      [{ source: danglingSourcePath, destination: movedDanglingPath }],
      false,
      allowedDirectories,
    );

    await expect(lstat(danglingSourcePath)).rejects.toThrow();
    expect((await lstat(movedDanglingPath)).isSymbolicLink()).toBe(true);
  });

  it("overwrites an existing destination file when overwrite is enabled", async () => {
    const destinationFilePath = join(sandboxRootPath, "existing.txt");
    await writeFile(destinationFilePath, "already here", "utf8");

    await handleMovePaths(
      [{ source: sourceFilePath, destination: destinationFilePath }],
      true,
      allowedDirectories,
    );

    await expect(lstat(sourceFilePath)).rejects.toThrow();
    expect(await readFile(destinationFilePath, "utf8")).toBe("source payload");
  });

  it("overwrites an existing destination directory when overwrite is enabled", async () => {
    const sourceDirectoryPath = join(sandboxRootPath, "source-dir");
    await mkdir(sourceDirectoryPath);
    await writeFile(join(sourceDirectoryPath, "moved-child.txt"), "moved child", "utf8");
    const destinationDirectoryPath = join(sandboxRootPath, "existing-dir");
    await mkdir(destinationDirectoryPath);
    await writeFile(join(destinationDirectoryPath, "stale-child.txt"), "stale child", "utf8");

    await handleMovePaths(
      [{ source: sourceDirectoryPath, destination: destinationDirectoryPath }],
      true,
      allowedDirectories,
    );

    await expect(lstat(sourceDirectoryPath)).rejects.toThrow();
    expect(await readFile(join(destinationDirectoryPath, "moved-child.txt"), "utf8")).toBe("moved child");
    await expect(lstat(join(destinationDirectoryPath, "stale-child.txt"))).rejects.toThrow();
  });

  it("surfaces non-ENOENT destination probe failures as move errors", async () => {
    const destinationFilePath = join(sandboxRootPath, "guarded-destination.txt");
    lstatInjectionState.codesByPath.set(destinationFilePath, "EPERM");
    try {
      const output = await handleMovePaths(
        [{ source: sourceFilePath, destination: destinationFilePath }],
        false,
        allowedDirectories,
      );

      expect(output).toContain("Failed to move");
      expect(output).toContain("EPERM");
    } finally {
      lstatInjectionState.codesByPath.clear();
    }

    expect(await readFile(sourceFilePath, "utf8")).toBe("source payload");
  });

  it("reports a failure when the source does not exist", async () => {
    const output = await handleMovePaths(
      [
        {
          source: join(sandboxRootPath, "missing.txt"),
          destination: join(sandboxRootPath, "dest.txt"),
        },
      ],
      false,
      allowedDirectories,
    );

    expect(output).toContain("Source does not exist");
  });

  it("refuses move batches beyond the shared path-mutation budget", async () => {
    const oversizedItems = Array.from(
      { length: MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST + 1 },
      (_, index) => ({
        source: join(sandboxRootPath, `source-${index}.txt`),
        destination: join(sandboxRootPath, `destination-${index}.txt`),
      }),
    );

    const output = await handleMovePaths(oversizedItems, false, allowedDirectories);

    expect(output).toContain("move_paths");
    expect(output).not.toContain("move operations processed successfully");
  });

  it("defaults overwrite to false in the schema", () => {
    const parsed = MovePathsArgsSchema.parse({
      operations: [{ sourcePath: "draft.txt", destinationPath: "archive/draft.txt" }],
    });

    expect(parsed.overwrite).toBe(false);
  });
});
