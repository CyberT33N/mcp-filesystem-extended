import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handleMovePaths } from "@domain/mutation/move-paths/handler";
import { MovePathsArgsSchema } from "@domain/mutation/move-paths/schema";

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

  it("defaults overwrite to false in the schema", () => {
    const parsed = MovePathsArgsSchema.parse({
      operations: [{ sourcePath: "draft.txt", destinationPath: "archive/draft.txt" }],
    });

    expect(parsed.overwrite).toBe(false);
  });
});
