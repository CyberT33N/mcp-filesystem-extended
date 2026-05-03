import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handleAppendFiles } from "@domain/mutation/append-files/handler";
import { AppendFilesArgsSchema } from "@domain/mutation/append-files/schema";

describe("append_files", () => {
  let sandboxRootPath = "";
  let allowedDirectories: string[] = [];
  let existingFilePath = "";
  let newFilePath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-append-files-"));
    allowedDirectories = [sandboxRootPath];
    existingFilePath = join(sandboxRootPath, "notes.txt");
    newFilePath = join(sandboxRootPath, "nested", "created.txt");

    await writeFile(existingFilePath, "hello", "utf8");
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("appends content to an existing file without removing earlier content", async () => {
    await handleAppendFiles(
      [{ path: existingFilePath, content: " world" }],
      allowedDirectories,
    );

    expect(await readFile(existingFilePath, "utf8")).toBe("hello world");
  });

  it("creates missing parent directories and a new file when the append target does not exist", async () => {
    await mkdir(join(sandboxRootPath, "nested"), { recursive: true });

    await handleAppendFiles(
      [{ path: newFilePath, content: "created by append" }],
      allowedDirectories,
    );

    expect(await readFile(newFilePath, "utf8")).toBe("created by append");
  });

  it("parses append targets through the batch schema", () => {
    const parsed = AppendFilesArgsSchema.parse({
      files: [{ path: "notes.txt", content: "x" }],
    });

    expect(parsed.files).toEqual([{ path: "notes.txt", content: "x" }]);
  });
});
