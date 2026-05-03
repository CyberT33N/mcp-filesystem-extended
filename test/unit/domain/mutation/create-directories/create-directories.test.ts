import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handleCreateDirectories } from "@domain/mutation/create-directories/handler";
import { CreateDirectoriesArgsSchema } from "@domain/mutation/create-directories/schema";

describe("create_directories", () => {
  let sandboxRootPath = "";
  let allowedDirectories: string[] = [];

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(
      join(tmpdir(), "mcp-fs-create-directories-"),
    );
    allowedDirectories = [sandboxRootPath];
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("creates every requested directory path within the allowed roots", async () => {
    const firstDirectoryPath = join(sandboxRootPath, "logs");
    const secondDirectoryPath = join(sandboxRootPath, "nested", "daily");

    await handleCreateDirectories(
      [firstDirectoryPath, secondDirectoryPath],
      allowedDirectories,
    );

    expect((await stat(firstDirectoryPath)).isDirectory()).toBe(true);
    expect((await stat(secondDirectoryPath)).isDirectory()).toBe(true);
  });

  it("parses one or more requested directory paths through the schema", () => {
    const parsed = CreateDirectoriesArgsSchema.parse({
      paths: ["logs", "artifacts/daily"],
    });

    expect(parsed.paths).toEqual(["logs", "artifacts/daily"]);
  });
});
