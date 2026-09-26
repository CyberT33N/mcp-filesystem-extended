import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getFileByteIdentityResult,
  handleVerifyFileByteIdentity,
} from "@domain/inspection/verify-file-byte-identity/handler";
import { hashesMatch, toFileRegion } from "@domain/inspection/verify-file-byte-identity/helpers";
import { VerifyFileByteIdentityArgsSchema } from "@domain/inspection/verify-file-byte-identity/schema";

describe("verify_file_byte_identity", () => {
  let allowedDirectories: string[] = [];
  let sandboxRootPath = "";
  let referenceFilePath = "";
  let matchingFilePath = "";
  let mismatchingFilePath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-byte-identity-"));
    allowedDirectories = [sandboxRootPath];
    referenceFilePath = join(sandboxRootPath, "reference.txt");
    matchingFilePath = join(sandboxRootPath, "matching.txt");
    mismatchingFilePath = join(sandboxRootPath, "mismatching.txt");

    await writeFile(referenceFilePath, "alpha\nbeta\n");
    await writeFile(matchingFilePath, "alpha\nbeta\n");
    await writeFile(mismatchingFilePath, "alpha\ngamma\n");
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  describe("VerifyFileByteIdentityArgsSchema", () => {
    it("defaults the region mode to whole-file and the algorithm to sha256", () => {
      const parsed = VerifyFileByteIdentityArgsSchema.parse({
        reference: { path: referenceFilePath },
        targets: [{ path: matchingFilePath }],
      });

      expect(parsed.algorithm).toBe("sha256");
      expect(parsed.reference.region).toBeUndefined();
    });

    it("rejects prefix-through-marker regions without a marker", () => {
      const result = VerifyFileByteIdentityArgsSchema.safeParse({
        reference: {
          path: referenceFilePath,
          region: { mode: "prefix-through-marker" },
        },
        targets: [{ path: matchingFilePath }],
      });

      expect(result.success).toBe(false);
    });

    it("rejects byte-range regions without start and endExclusive", () => {
      const result = VerifyFileByteIdentityArgsSchema.safeParse({
        reference: { path: referenceFilePath },
        targets: [{ path: matchingFilePath, region: { mode: "byte-range" } }],
      });

      expect(result.success).toBe(false);
    });

    it("rejects byte-range regions whose endExclusive is not greater than start", () => {
      const result = VerifyFileByteIdentityArgsSchema.safeParse({
        reference: { path: referenceFilePath },
        targets: [
          {
            path: matchingFilePath,
            region: { mode: "byte-range", start: 4, endExclusive: 4 },
          },
        ],
      });

      expect(result.success).toBe(false);
    });

    it("accepts fully bound prefix-through-marker and byte-range regions", () => {
      const result = VerifyFileByteIdentityArgsSchema.safeParse({
        reference: {
          path: referenceFilePath,
          region: { mode: "prefix-through-marker", marker: "beta" },
        },
        targets: [
          {
            path: matchingFilePath,
            region: { mode: "byte-range", start: 0, endExclusive: 5 },
          },
        ],
        algorithm: "sha1",
      });

      expect(result.success).toBe(true);
    });

    it("rejects an empty targets array and an unknown algorithm", () => {
      const emptyTargets = VerifyFileByteIdentityArgsSchema.safeParse({
        reference: { path: referenceFilePath },
        targets: [],
      });
      const unknownAlgorithm = VerifyFileByteIdentityArgsSchema.safeParse({
        reference: { path: referenceFilePath },
        targets: [{ path: matchingFilePath }],
        algorithm: "blake2",
      });

      expect(emptyTargets.success).toBe(false);
      expect(unknownAlgorithm.success).toBe(false);
    });
  });

  describe("toFileRegion", () => {
    it("narrows whole-file regions", () => {
      expect(toFileRegion({ mode: "whole-file" })).toEqual({ mode: "whole-file" });
    });

    it("narrows prefix-through-marker regions", () => {
      expect(toFileRegion({ mode: "prefix-through-marker", marker: "# MARK" })).toEqual({
        mode: "prefix-through-marker",
        marker: "# MARK",
      });
    });

    it("narrows byte-range regions", () => {
      expect(toFileRegion({ mode: "byte-range", start: 0, endExclusive: 4 })).toEqual({
        mode: "byte-range",
        start: 0,
        endExclusive: 4,
      });
    });

    it("throws when a prefix-through-marker region lacks the marker", () => {
      expect(() => toFileRegion({ mode: "prefix-through-marker" })).toThrow(
        "marker is required when mode is prefix-through-marker",
      );
    });

    it("throws when a byte-range region lacks bounds", () => {
      expect(() => toFileRegion({ mode: "byte-range" })).toThrow(
        "start and endExclusive are required when mode is byte-range",
      );
      expect(() => toFileRegion({ mode: "byte-range", start: 0 })).toThrow(
        "start and endExclusive are required when mode is byte-range",
      );
    });

    it("throws when endExclusive is not greater than start", () => {
      expect(() => toFileRegion({ mode: "byte-range", start: 2, endExclusive: 2 })).toThrow(
        "endExclusive must be greater than start",
      );
    });
  });

  describe("hashesMatch", () => {
    it("compares hashes with lowercase-and-trim normalization", () => {
      expect(hashesMatch("ABCD1234 ", " abcd1234")).toBe(true);
      expect(hashesMatch("abcd1234", "dcba4321")).toBe(false);
    });
  });

  describe("getFileByteIdentityResult", () => {
    it("returns identical, different, and error outcomes with summary counts in request order", async () => {
      const missingFilePath = join(sandboxRootPath, "missing.txt");
      const result = await getFileByteIdentityResult(
        { path: referenceFilePath },
        [
          { path: matchingFilePath },
          { path: mismatchingFilePath },
          { path: missingFilePath },
        ],
        "sha256",
        allowedDirectories,
      );

      expect(result.reference.path).toBe(referenceFilePath);
      expect(result.reference.regionHash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.entries.map((entry) => entry.path)).toEqual([
        matchingFilePath,
        mismatchingFilePath,
      ]);
      expect(result.entries[0]?.valid).toBe(true);
      expect(result.entries[1]?.valid).toBe(false);
      expect(result.errors[0]?.path).toBe(missingFilePath);
      expect(result.summary).toEqual({ validCount: 1, invalidCount: 1, errorCount: 1 });
    });

    it("fails the whole request when the reference cannot be read", async () => {
      await expect(
        getFileByteIdentityResult(
          { path: join(sandboxRootPath, "missing-reference.txt") },
          [{ path: matchingFilePath }],
          "sha256",
          allowedDirectories,
        ),
      ).rejects.toThrow();
    });

    it("fails the whole request when the reference marker is absent", async () => {
      await expect(
        getFileByteIdentityResult(
          {
            path: referenceFilePath,
            region: { mode: "prefix-through-marker", marker: "# ABSENT" },
          },
          [{ path: matchingFilePath }],
          "sha256",
          allowedDirectories,
        ),
      ).rejects.toThrow("marker not found");
    });

    it("verifies governed regions through prefix-through-marker bindings", async () => {
      const governedReferencePath = join(sandboxRootPath, "governed-reference.txt");
      const governedMatchingPath = join(sandboxRootPath, "governed-matching.txt");
      const governedMismatchingPath = join(sandboxRootPath, "governed-mismatching.txt");

      await writeFile(governedReferencePath, "alpha\n# MARK\nfree-reference\n");
      await writeFile(governedMatchingPath, "alpha\n# MARK\nfree-target\n");
      await writeFile(governedMismatchingPath, "beta\n# MARK\nfree-target\n");

      const result = await getFileByteIdentityResult(
        {
          path: governedReferencePath,
          region: { mode: "prefix-through-marker", marker: "# MARK" },
        },
        [
          {
            path: governedMatchingPath,
            region: { mode: "prefix-through-marker", marker: "# MARK" },
          },
          {
            path: governedMismatchingPath,
            region: { mode: "prefix-through-marker", marker: "# MARK" },
          },
        ],
        "sha256",
        allowedDirectories,
      );

      expect(result.entries[0]?.valid).toBe(true);
      expect(result.entries[1]?.valid).toBe(false);
      expect(result.summary).toEqual({ validCount: 1, invalidCount: 1, errorCount: 0 });
    });

    it("supports byte-range regions that ignore content outside the window", async () => {
      const windowedTargetPath = join(sandboxRootPath, "windowed-target.txt");
      await writeFile(windowedTargetPath, "alpha\nCOMPLETELY-DIFFERENT\n");

      const result = await getFileByteIdentityResult(
        {
          path: referenceFilePath,
          region: { mode: "byte-range", start: 0, endExclusive: 6 },
        },
        [
          {
            path: windowedTargetPath,
            region: { mode: "byte-range", start: 0, endExclusive: 6 },
          },
        ],
        "sha256",
        allowedDirectories,
      );

      expect(result.entries[0]?.valid).toBe(true);
    });

    it("keeps a target marker failure as a per-file error", async () => {
      const result = await getFileByteIdentityResult(
        { path: referenceFilePath },
        [
          {
            path: matchingFilePath,
            region: { mode: "prefix-through-marker", marker: "# ABSENT" },
          },
        ],
        "sha256",
        allowedDirectories,
      );

      expect(result.entries).toEqual([]);
      expect(result.errors[0]?.path).toBe(matchingFilePath);
      expect(result.errors[0]?.error).toBe("marker not found");
      expect(result.summary).toEqual({ validCount: 0, invalidCount: 0, errorCount: 1 });
    });
  });

  describe("handleVerifyFileByteIdentity", () => {
    it("formats identical, different, and error sections in the caller-visible output", async () => {
      const missingFilePath = join(sandboxRootPath, "missing.txt");
      const output = await handleVerifyFileByteIdentity(
        { path: referenceFilePath },
        [
          { path: matchingFilePath },
          { path: mismatchingFilePath },
          { path: missingFilePath },
        ],
        "sha256",
        allowedDirectories,
      );

      expect(output).toContain("Byte Identity Verification (sha256):");
      expect(output).toContain(`Reference: ${referenceFilePath}`);
      expect(output).toContain("✅ Identical: 1");
      expect(output).toContain("❌ Different: 1");
      expect(output).toContain("⚠️ Errors: 1");
      expect(output).toContain("Identical Files:");
      expect(output).toContain(`✓ ${matchingFilePath}`);
      expect(output).toContain("Different Files:");
      expect(output).toContain(`✗ ${mismatchingFilePath}`);
      expect(output).toContain("Errors:");
      expect(output).toContain(`! ${missingFilePath}:`);
    });

    it("formats an all-identical batch without different or error sections", async () => {
      const output = await handleVerifyFileByteIdentity(
        { path: referenceFilePath },
        [{ path: matchingFilePath }],
        "sha256",
        allowedDirectories,
      );

      expect(output).toContain("✅ Identical: 1");
      expect(output).toContain("Identical Files:");
      expect(output).not.toContain("Different Files:");
      expect(output).not.toContain("\nErrors:");
    });
  });
});
