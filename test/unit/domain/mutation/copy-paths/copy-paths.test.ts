import { lstat, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handleCopyPaths } from "@domain/mutation/copy-paths/handler";
import {
  assertCopyOperationsAreSafeForParallelExecution,
  type PreparedCopyPathsOperation,
} from "@domain/mutation/copy-paths/helpers";
import { CopyPathsArgsSchema } from "@domain/mutation/copy-paths/schema";

describe("copy_paths", () => {
  let sandboxRootPath = "";
  let allowedDirectories: string[] = [];
  let sourceFilePath = "";
  let secondSourceFilePath = "";
  let sourceDirectoryPath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-copy-paths-"));
    allowedDirectories = [sandboxRootPath];
    sourceFilePath = join(sandboxRootPath, "source.txt");
    secondSourceFilePath = join(sandboxRootPath, "second.txt");
    sourceDirectoryPath = join(sandboxRootPath, "source-directory");

    await writeFile(sourceFilePath, "source payload", "utf8");
    await writeFile(secondSourceFilePath, "second payload", "utf8");
    await mkdir(join(sourceDirectoryPath, "nested"), { recursive: true });
    await writeFile(
      join(sourceDirectoryPath, "nested", "child.txt"),
      "nested payload",
      "utf8",
    );
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("copies a file into missing destination parents and returns a batch summary", async () => {
    const destinationFilePath = join(
      sandboxRootPath,
      "archive",
      "copies",
      "source.txt",
    );

    const output = await handleCopyPaths(
      [
        {
          source: sourceFilePath,
          destination: destinationFilePath,
          recursive: false,
          overwrite: false,
        },
      ],
      allowedDirectories,
    );

    expect(await readFile(destinationFilePath, "utf8")).toBe("source payload");
    expect(output).toContain("Processed 1 copy paths operations:");
    expect(output).toContain(
      `Successfully copied file ${sourceFilePath} to ${destinationFilePath}`,
    );
  });

  it("copies directories recursively when the recursive flag is enabled", async () => {
    const destinationDirectoryPath = join(
      sandboxRootPath,
      "mirrors",
      "source-directory",
    );

    await handleCopyPaths(
      [
        {
          source: sourceDirectoryPath,
          destination: destinationDirectoryPath,
          recursive: true,
          overwrite: false,
        },
      ],
      allowedDirectories,
    );

    expect(
      await readFile(
        join(destinationDirectoryPath, "nested", "child.txt"),
        "utf8",
      ),
    ).toBe("nested payload");
  });

  it("rejects overlapping parallel destinations before copy work starts", async () => {
    const operations: PreparedCopyPathsOperation[] = [
      {
        source: sourceFilePath,
        destination: join(sandboxRootPath, "shared"),
        recursive: false,
        overwrite: false,
        validSourcePath: sourceFilePath,
        validDestinationPath: join(sandboxRootPath, "shared"),
      },
      {
        source: secondSourceFilePath,
        destination: join(sandboxRootPath, "shared", "child.txt"),
        recursive: false,
        overwrite: false,
        validSourcePath: secondSourceFilePath,
        validDestinationPath: join(sandboxRootPath, "shared", "child.txt"),
      },
    ];

    await expect(
      assertCopyOperationsAreSafeForParallelExecution(operations),
    ).rejects.toThrow(
      "Two copy operations target the same or overlapping destination paths.",
    );
  });

  it("copies the resolved target content of a nested file symlink", async () => {
    const aliasPath = join(sourceDirectoryPath, "alias.txt");
    await symlink(sourceFilePath, aliasPath, "file");
    const destinationDirectoryPath = join(sandboxRootPath, "file-alias-copy");

    await handleCopyPaths(
      [
        {
          source: sourceDirectoryPath,
          destination: destinationDirectoryPath,
          recursive: true,
          overwrite: false,
        },
      ],
      allowedDirectories,
    );

    const copiedAliasPath = join(destinationDirectoryPath, "alias.txt");
    expect((await lstat(copiedAliasPath)).isSymbolicLink()).toBe(false);
    expect(await readFile(copiedAliasPath, "utf8")).toBe("source payload");
  });

  it("copies directory content through a nested directory junction as a real directory", async () => {
    const elsewhereDirectoryPath = join(sandboxRootPath, "elsewhere");
    await mkdir(elsewhereDirectoryPath);
    await writeFile(join(elsewhereDirectoryPath, "payload.txt"), "elsewhere payload", "utf8");
    const junctionPath = join(sourceDirectoryPath, "alias-dir");
    await symlink(elsewhereDirectoryPath, junctionPath, "junction");
    const destinationDirectoryPath = join(sandboxRootPath, "copied-tree");

    await handleCopyPaths(
      [
        {
          source: sourceDirectoryPath,
          destination: destinationDirectoryPath,
          recursive: true,
          overwrite: false,
        },
      ],
      allowedDirectories,
    );

    const copiedAliasPath = join(destinationDirectoryPath, "alias-dir");
    const copiedStats = await lstat(copiedAliasPath);
    expect(copiedStats.isSymbolicLink()).toBe(false);
    expect(copiedStats.isDirectory()).toBe(true);
    expect(await readFile(join(copiedAliasPath, "payload.txt"), "utf8")).toBe("elsewhere payload");
  });

  it("copies the target content when the source itself is a directory junction", async () => {
    const junctionSourcePath = join(sandboxRootPath, "source-alias");
    await symlink(sourceDirectoryPath, junctionSourcePath, "junction");
    const destinationDirectoryPath = join(sandboxRootPath, "from-alias");

    await handleCopyPaths(
      [
        {
          source: junctionSourcePath,
          destination: destinationDirectoryPath,
          recursive: true,
          overwrite: false,
        },
      ],
      allowedDirectories,
    );

    expect(
      await readFile(join(destinationDirectoryPath, "nested", "child.txt"), "utf8"),
    ).toBe("nested payload");
  });

  it("rejects directory copies that would follow a symbolic link cycle", async () => {
    const cycleLinkPath = join(sourceDirectoryPath, "cycle");
    await symlink(sourceDirectoryPath, cycleLinkPath, "junction");
    const destinationDirectoryPath = join(sandboxRootPath, "cycle-copy");

    const output = await handleCopyPaths(
      [
        {
          source: sourceDirectoryPath,
          destination: destinationDirectoryPath,
          recursive: true,
          overwrite: false,
        },
      ],
      allowedDirectories,
    );

    expect(output).toContain("symbolic link cycle detected");
  });

  it("refuses to follow a nested alias whose target escapes the allowed directories", async () => {
    const outsideRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-copy-outside-"));
    try {
      await writeFile(join(outsideRootPath, "secret.txt"), "outside payload", "utf8");
      const escapeLinkPath = join(sourceDirectoryPath, "escape");
      await symlink(outsideRootPath, escapeLinkPath, "junction");
      const destinationDirectoryPath = join(sandboxRootPath, "escape-copy");

      const output = await handleCopyPaths(
        [
          {
            source: sourceDirectoryPath,
            destination: destinationDirectoryPath,
            recursive: true,
            overwrite: false,
          },
        ],
        allowedDirectories,
      );

      expect(output).toContain("symlink target outside allowed directories");
    } finally {
      await rm(outsideRootPath, { recursive: true, force: true });
    }
  });

  it("rejects a directory copy into its own destination subtree", async () => {
    const operations: PreparedCopyPathsOperation[] = [
      {
        source: sourceDirectoryPath,
        destination: join(sourceDirectoryPath, "inner-copy"),
        recursive: true,
        overwrite: false,
        validSourcePath: sourceDirectoryPath,
        validDestinationPath: join(sourceDirectoryPath, "inner-copy"),
      },
    ];

    await expect(
      assertCopyOperationsAreSafeForParallelExecution(operations),
    ).rejects.toThrow(
      "The copy request places a directory into its own destination subtree.",
    );
  });

  it("rejects a batch whose destination overlaps a later operation source", async () => {
    const operations: PreparedCopyPathsOperation[] = [
      {
        source: sourceFilePath,
        destination: join(sourceDirectoryPath, "incoming.txt"),
        recursive: false,
        overwrite: false,
        validSourcePath: sourceFilePath,
        validDestinationPath: join(sourceDirectoryPath, "incoming.txt"),
      },
      {
        source: sourceDirectoryPath,
        destination: join(sandboxRootPath, "dir-copy"),
        recursive: true,
        overwrite: false,
        validSourcePath: sourceDirectoryPath,
        validDestinationPath: join(sandboxRootPath, "dir-copy"),
      },
    ];

    await expect(
      assertCopyOperationsAreSafeForParallelExecution(operations),
    ).rejects.toThrow(
      "One copy operation writes to a path that overlaps the source of another operation.",
    );
  });

  it("rejects a batch whose source overlaps a later operation destination", async () => {
    const operations: PreparedCopyPathsOperation[] = [
      {
        source: sourceDirectoryPath,
        destination: join(sandboxRootPath, "dir-copy"),
        recursive: true,
        overwrite: false,
        validSourcePath: sourceDirectoryPath,
        validDestinationPath: join(sandboxRootPath, "dir-copy"),
      },
      {
        source: sourceFilePath,
        destination: join(sourceDirectoryPath, "incoming.txt"),
        recursive: false,
        overwrite: false,
        validSourcePath: sourceFilePath,
        validDestinationPath: join(sourceDirectoryPath, "incoming.txt"),
      },
    ];

    await expect(
      assertCopyOperationsAreSafeForParallelExecution(operations),
    ).rejects.toThrow(
      "One copy operation writes to a path that overlaps the source of another operation.",
    );
  });

  it("treats destinations case-sensitively for conflict checks off Windows", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    try {
      const operations: PreparedCopyPathsOperation[] = [
        {
          source: sourceFilePath,
          destination: join(sandboxRootPath, "Case"),
          recursive: false,
          overwrite: false,
          validSourcePath: sourceFilePath,
          validDestinationPath: join(sandboxRootPath, "Case"),
        },
        {
          source: secondSourceFilePath,
          destination: join(sandboxRootPath, "case"),
          recursive: false,
          overwrite: false,
          validSourcePath: secondSourceFilePath,
          validDestinationPath: join(sandboxRootPath, "case"),
        },
      ];

      await expect(
        assertCopyOperationsAreSafeForParallelExecution(operations),
      ).resolves.toBeUndefined();
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    }
  });

  it("parses copy batches through the schema", () => {
    const parsed = CopyPathsArgsSchema.parse({
      operations: [
        {
          sourcePath: "source.txt",
          destinationPath: "backup/source.txt",
          recursive: true,
          overwrite: true,
        },
      ],
    });

    expect(parsed.operations).toEqual([
      {
        sourcePath: "source.txt",
        destinationPath: "backup/source.txt",
        recursive: true,
        overwrite: true,
      },
    ]);
  });
});
