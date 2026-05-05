import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
