import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@infrastructure/logging/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  validatePath,
  validatePathForCreation,
} from "@infrastructure/filesystem/path-guard";

describe("path_guard", () => {
  let allowedRootPath = "";
  let outsideRootPath = "";
  let existingDirectoryPath = "";
  let existingFilePath = "";

  beforeEach(async () => {
    allowedRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-path-guard-"));
    outsideRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-path-guard-outside-"));
    existingDirectoryPath = join(allowedRootPath, "existing");
    existingFilePath = join(existingDirectoryPath, "sample.txt");

    await mkdir(existingDirectoryPath, { recursive: true });
    await writeFile(existingFilePath, "guard", "utf8");
  });

  afterEach(async () => {
    if (allowedRootPath !== "") {
      await rm(allowedRootPath, { recursive: true, force: true });
    }

    if (outsideRootPath !== "") {
      await rm(outsideRootPath, { recursive: true, force: true });
    }
  });

  it("returns the real path for an existing file inside an allowed directory", async () => {
    await expect(validatePath(existingFilePath, [allowedRootPath])).resolves.toBe(
      existingFilePath,
    );
  });

  it("rejects paths outside the allowed directory set", async () => {
    const disallowedFilePath = join(outsideRootPath, "foreign.txt");

    await expect(validatePath(disallowedFilePath, [allowedRootPath])).rejects.toThrow(
      "Access denied - path outside allowed directories",
    );
  });

  it("rejects nested new-file paths when the immediate parent directory does not exist", async () => {
    const missingParentDirectoryPath = join(allowedRootPath, "missing");
    const missingParentFilePath = join(missingParentDirectoryPath, "child.txt");

    await expect(validatePath(missingParentFilePath, [allowedRootPath])).rejects.toThrow(
      `Parent directory does not exist: ${missingParentDirectoryPath}`,
    );
  });

  it("allows creation paths when the nearest existing ancestor stays within an allowed directory", async () => {
    const nestedCreationPath = join(allowedRootPath, "new", "deep", "file.txt");

    await expect(validatePathForCreation(nestedCreationPath, [allowedRootPath])).resolves.toBe(
      nestedCreationPath,
    );
  });
});
