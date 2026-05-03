import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getFileChecksumVerificationResult,
  handleChecksumFilesVerif,
} from "@domain/inspection/verify-file-checksums/handler";
import { VerifyFileChecksumsArgsSchema } from "@domain/inspection/verify-file-checksums/schema";
import { validateHash } from "@domain/inspection/verify-file-checksums/helpers";

describe("verify_file_checksums", () => {
  let allowedDirectories: string[] = [];
  let sandboxRootPath = "";
  let matchingFilePath = "";
  let mismatchingFilePath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-verify-checksum-"));
    allowedDirectories = [sandboxRootPath];
    matchingFilePath = join(sandboxRootPath, "matching.txt");
    mismatchingFilePath = join(sandboxRootPath, "mismatching.txt");

    await mkdir(sandboxRootPath, { recursive: true });
    await writeFile(matchingFilePath, "match\n");
    await writeFile(mismatchingFilePath, "mismatch\n");
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("normalizes hash comparison in the helper surface", () => {
    expect(validateHash("ABCD1234 ", " abcd1234")).toBe(true);
    expect(validateHash("abcd1234", "dcba4321")).toBe(false);
  });

  it("returns structured verification entries, failures, and summary counts", async () => {
    const matchingHash = createHash("sha256").update("match\n").digest("hex");
    const missingFilePath = join(sandboxRootPath, "missing.txt");
    const result = await getFileChecksumVerificationResult(
      [
        {
          path: matchingFilePath,
          expectedHash: matchingHash,
        },
        {
          path: mismatchingFilePath,
          expectedHash: matchingHash,
        },
        {
          path: missingFilePath,
          expectedHash: matchingHash,
        },
      ],
      "sha256",
      allowedDirectories,
    );

    const matchingEntry = result.entries.find((entry) => entry.path === matchingFilePath);
    const mismatchingEntry = result.entries.find(
      (entry) => entry.path === mismatchingFilePath,
    );
    const firstError = result.errors[0];

    expect(matchingEntry?.valid).toBe(true);
    expect(mismatchingEntry?.valid).toBe(false);
    expect(firstError?.path).toBe(missingFilePath);
    expect(result.summary.validCount).toBe(1);
    expect(result.summary.invalidCount).toBe(1);
    expect(result.summary.errorCount).toBe(1);
  });

  it("formats valid, invalid, and error sections in the caller-visible output", async () => {
    const matchingHash = createHash("sha256").update("match\n").digest("hex");
    const output = await handleChecksumFilesVerif(
      [
        {
          path: matchingFilePath,
          expectedHash: matchingHash,
        },
        {
          path: mismatchingFilePath,
          expectedHash: matchingHash,
        },
      ],
      "sha256",
      allowedDirectories,
    );

    expect(output).toContain("Checksum Verification Results (sha256):");
    expect(output).toContain("✅ Valid: 1");
    expect(output).toContain("❌ Invalid: 1");
    expect(output).toContain(`✓ ${matchingFilePath}`);
    expect(output).toContain(`✗ ${mismatchingFilePath}`);
  });

  it("defaults the verification algorithm to sha256", () => {
    const parsed = VerifyFileChecksumsArgsSchema.parse({
      files: [
        {
          path: matchingFilePath,
          expectedHash: "abc123",
        },
      ],
    });

    expect(parsed.algorithm).toBe("sha256");
  });
});
