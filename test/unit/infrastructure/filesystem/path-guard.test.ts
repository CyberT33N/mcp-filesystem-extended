import fs, { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os, { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@infrastructure/logging/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  resolveRequestedPath,
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
    vi.restoreAllMocks();

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

  it("resolves requested paths to their absolute operation path without following links", async () => {
    const linkedFilePath = join(allowedRootPath, "linked.txt");
    const aliasPath = join(allowedRootPath, "alias.txt");
    await writeFile(linkedFilePath, "canonical", "utf8");
    await symlink(linkedFilePath, aliasPath, "file");

    expect(resolveRequestedPath(aliasPath)).toBe(aliasPath);
    expect(resolveRequestedPath(join("relative", "target.txt"))).toBe(
      join(process.cwd(), "relative", "target.txt"),
    );
    expect(resolveRequestedPath("~/home-file.txt")).toBe(
      join(os.homedir(), "home-file.txt"),
    );
  });

  it("fails closed when the nearest existing ancestor resolves outside the allowed set", async () => {
    const aliasDirectoryPath = join(allowedRootPath, "alias-outside");
    await symlink(outsideRootPath, aliasDirectoryPath, "junction");
    const candidatePath = join(aliasDirectoryPath, "child.txt");

    await expect(validatePath(candidatePath, [allowedRootPath])).rejects.toThrow(
      `Parent directory does not exist: ${aliasDirectoryPath}`,
    );
  });

  it("rethrows ancestor stat failures that are not missing-entry signals", async () => {
    vi.spyOn(fs, "stat").mockRejectedValueOnce(
      Object.assign(new Error("permission denied"), { code: "EACCES" }),
    );

    await expect(
      validatePathForCreation(join(allowedRootPath, "candidate.txt"), [allowedRootPath]),
    ).rejects.toThrow("permission denied");
  });

  it("fails closed when no existing ancestor can be found", async () => {
    vi.spyOn(fs, "stat").mockRejectedValue(
      Object.assign(new Error("no such file or directory"), { code: "ENOENT" }),
    );

    await expect(
      validatePathForCreation(join(allowedRootPath, "deep", "candidate.txt"), [
        allowedRootPath,
      ]),
    ).rejects.toThrow("no existing ancestor found");
  });

  it("resolves relative candidate paths against the process working directory", async () => {
    await expect(validatePathForCreation("rel-candidate.txt", ["."])).resolves.toBe(
      join(process.cwd(), "rel-candidate.txt"),
    );
  });

  it("rejects creation paths outside the allowed directory set at the prefix gate", async () => {
    const foreignPath = join(outsideRootPath, "foreign.txt");

    await expect(validatePathForCreation(foreignPath, [allowedRootPath])).rejects.toThrow(
      "Access denied - path outside allowed directories",
    );
  });

  it("resolves relative existing paths against the process working directory", async () => {
    await expect(validatePath("rel-guard.txt", [process.cwd()])).resolves.toBe(
      join(process.cwd(), "rel-guard.txt"),
    );
  });

  it("resolves through the parent fallback when an existing alias target escapes the allowed set", async () => {
    const outsideFilePath = join(outsideRootPath, "secret.txt");
    await writeFile(outsideFilePath, "secret", "utf8");
    const aliasFilePath = join(allowedRootPath, "alias-secret.txt");
    await symlink(outsideFilePath, aliasFilePath, "file");

    await expect(validatePath(aliasFilePath, [allowedRootPath])).resolves.toBe(aliasFilePath);
  });

  it("returns the absolute candidate for new files whose parent exists inside the allowed set", async () => {
    const newFilePath = join(allowedRootPath, "new-file.txt");

    await expect(validatePath(newFilePath, [allowedRootPath])).resolves.toBe(newFilePath);
  });

  it("validates creation candidates that already exist as files through their parent directory", async () => {
    await expect(validatePathForCreation(existingFilePath, [allowedRootPath])).resolves.toBe(
      existingFilePath,
    );
  });

  it("ascends past a junction-escaped ancestor under the current self-swallowing walk", async () => {
    const aliasDirectoryPath = join(allowedRootPath, "alias-outside");
    await symlink(outsideRootPath, aliasDirectoryPath, "junction");
    const candidatePath = join(aliasDirectoryPath, "deep", "child.txt");

    await expect(validatePathForCreation(candidatePath, [allowedRootPath])).resolves.toBe(
      candidatePath,
    );
  });
});
