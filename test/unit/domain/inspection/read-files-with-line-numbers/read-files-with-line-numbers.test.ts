import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handleReadFiles } from "@domain/inspection/read-files-with-line-numbers/handler";
import { ReadFilesWithLineNumbersArgsSchema } from "@domain/inspection/read-files-with-line-numbers/schema";

describe("read_files_with_line_numbers", () => {
  let sandboxRootPath = "";
  let allowedDirectories: string[] = [];
  let firstFilePath = "";
  let secondFilePath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(
      join(tmpdir(), "mcp-fs-read-files-with-lines-"),
    );
    allowedDirectories = [sandboxRootPath];
    firstFilePath = join(sandboxRootPath, "first.txt");
    secondFilePath = join(sandboxRootPath, "nested", "second.txt");

    await mkdir(join(sandboxRootPath, "nested"), { recursive: true });
    await writeFile(firstFilePath, "alpha\nbeta\n");
    await writeFile(secondFilePath, "gamma\n");
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("reads multiple files and preserves request order in the line-numbered response", async () => {
    const output = await handleReadFiles(
      [firstFilePath, secondFilePath],
      allowedDirectories,
    );

    const firstIndex = output.indexOf(`${firstFilePath}:`);
    const secondIndex = output.indexOf(`${secondFilePath}:`);

    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(secondIndex).toBeGreaterThan(firstIndex);
    expect(output).toContain("1: alpha");
    expect(output).toContain("2: beta");
    expect(output).toContain("1: gamma");
    expect(output).toContain("\n---\n");
  });

  it("rejects projected oversized batches before building the direct-read response", async () => {
    const oversizedFilePath = join(sandboxRootPath, "oversized.txt");

    await writeFile(oversizedFilePath, "x\n".repeat(80_000));

    await expect(
      handleReadFiles([oversizedFilePath], allowedDirectories),
    ).rejects.toThrow(
      "Projected line-numbered file read output exceeds the direct-read family cap.",
    );
  });

  it("parses one or more requested file paths through the batch schema", () => {
    const parsed = ReadFilesWithLineNumbersArgsSchema.parse({
      paths: [firstFilePath, secondFilePath],
    });

    expect(parsed.paths).toEqual([firstFilePath, secondFilePath]);
  });
});
