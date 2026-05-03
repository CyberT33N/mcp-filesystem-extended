import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handleCreateFiles } from "@domain/mutation/create-files/handler";
import { CreateFilesArgsSchema } from "@domain/mutation/create-files/schema";

describe("create_files", () => {
  let sandboxRootPath = "";
  let allowedDirectories: string[] = [];
  let existingFilePath = "";
  let createdFilePath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-create-files-"));
    allowedDirectories = [sandboxRootPath];
    existingFilePath = join(sandboxRootPath, "existing.txt");
    createdFilePath = join(sandboxRootPath, "nested", "created.txt");

    await writeFile(existingFilePath, "keep me", "utf8");
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("creates a new file and its missing parent directories", async () => {
    await handleCreateFiles(
      [{ path: createdFilePath, content: "hello from create_files" }],
      allowedDirectories,
    );

    expect(await readFile(createdFilePath, "utf8")).toBe(
      "hello from create_files",
    );
  });

  it("refuses to overwrite an existing file through the creation surface", async () => {
    const output = await handleCreateFiles(
      [{ path: existingFilePath, content: "replace me" }],
      allowedDirectories,
    );

    expect(await readFile(existingFilePath, "utf8")).toBe("keep me");
    expect(output).toContain("File already exists");
  });

  it("parses file creation payloads through the batch schema", () => {
    const parsed = CreateFilesArgsSchema.parse({
      files: [{ path: "notes.txt", content: "hello" }],
    });

    expect(parsed.files).toEqual([{ path: "notes.txt", content: "hello" }]);
  });
});
