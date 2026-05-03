import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getFileChecksumsResult,
  handleChecksumFiles,
} from "@domain/inspection/get-file-checksums/handler";
import { GetFileChecksumsArgsSchema } from "@domain/inspection/get-file-checksums/schema";

describe("get_file_checksums", () => {
  let allowedDirectories: string[] = [];
  let sandboxRootPath = "";
  let firstFilePath = "";
  let secondFilePath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-checksum-"));
    allowedDirectories = [sandboxRootPath];
    firstFilePath = join(sandboxRootPath, "alpha.txt");
    secondFilePath = join(sandboxRootPath, "beta.txt");

    await mkdir(sandboxRootPath, { recursive: true });
    await writeFile(firstFilePath, "alpha\n");
    await writeFile(secondFilePath, "beta\n");
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("returns structured checksum entries and preserves per-path failures", async () => {
    const missingFilePath = join(sandboxRootPath, "missing.txt");
    const result = await getFileChecksumsResult(
      [firstFilePath, missingFilePath],
      "sha256",
      allowedDirectories,
    );

    const firstEntry = result.entries[0];
    const firstError = result.errors[0];

    expect(firstEntry).toBeDefined();
    expect(firstError).toBeDefined();

    if (firstEntry === undefined || firstError === undefined) {
      throw new Error("Expected one checksum entry and one checksum error.");
    }

    expect(firstEntry.path).toBe(firstFilePath);
    expect(firstEntry.hash).toBe(
      createHash("sha256").update("alpha\n").digest("hex"),
    );
    expect(firstError.path).toBe(missingFilePath);
    expect(firstError.error.length).toBeGreaterThan(0);
  });

  it("formats checksum output for successful and failed files", async () => {
    const missingFilePath = join(sandboxRootPath, "missing.txt");
    const output = await handleChecksumFiles(
      [firstFilePath, secondFilePath, missingFilePath],
      "md5",
      allowedDirectories,
    );

    expect(output).toContain("Checksums (md5):");
    expect(output).toContain(firstFilePath);
    expect(output).toContain(secondFilePath);
    expect(output).toContain("Errors:");
    expect(output).toContain(missingFilePath);
  });

  it("defaults the checksum algorithm to sha256", () => {
    const parsed = GetFileChecksumsArgsSchema.parse({
      paths: [firstFilePath],
    });

    expect(parsed.algorithm).toBe("sha256");
  });
});
