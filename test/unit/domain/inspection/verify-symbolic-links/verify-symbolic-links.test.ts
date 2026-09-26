import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getSymbolicLinkVerificationResult,
  handleVerifySymbolicLinks,
} from "@domain/inspection/verify-symbolic-links/handler";
import { symbolicLinkTargetsMatch } from "@domain/inspection/verify-symbolic-links/helpers";
import { VerifySymbolicLinksArgsSchema } from "@domain/inspection/verify-symbolic-links/schema";

describe("verify_symbolic_links", () => {
  let sandboxRootPath = "";
  let allowedDirectories: string[] = [];
  let targetFilePath = "";
  let validLinkPath = "";
  let danglingLinkPath = "";
  let mismatchLinkPath = "";
  let plainFilePath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-verify-symbolic-links-"));
    allowedDirectories = [sandboxRootPath];
    targetFilePath = join(sandboxRootPath, "canonical", "shared.md");
    validLinkPath = join(sandboxRootPath, "consumers", "shortcut.md");
    danglingLinkPath = join(sandboxRootPath, "consumers", "dangling.md");
    mismatchLinkPath = join(sandboxRootPath, "consumers", "mismatch.md");
    plainFilePath = join(sandboxRootPath, "consumers", "plain.md");

    await mkdir(join(sandboxRootPath, "canonical"), { recursive: true });
    await mkdir(join(sandboxRootPath, "consumers"), { recursive: true });
    await writeFile(targetFilePath, "shared content", "utf8");
    await writeFile(plainFilePath, "plain content", "utf8");
    await symlink("../canonical/shared.md", validLinkPath);
    await symlink("../canonical/shared.md", mismatchLinkPath);
    await symlink("../canonical/missing.md", danglingLinkPath);
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("matches stored targets with exact trimmed equality in the helper surface", () => {
    expect(symbolicLinkTargetsMatch("../canonical/shared.md", "../canonical/shared.md")).toBe(true);
    expect(symbolicLinkTargetsMatch("../canonical/shared.md ", " ../canonical/shared.md")).toBe(true);
    expect(symbolicLinkTargetsMatch("../canonical/shared.md", "../canonical/other.md")).toBe(false);
  });

  it("matches the platform-normalized stored form against the portable expectation", () => {
    const portableExpectation = "../canonical/shared.md";
    const platformStoredForm = normalize(portableExpectation);

    expect(symbolicLinkTargetsMatch(platformStoredForm, portableExpectation)).toBe(true);
  });

  it("verifies a valid relative link with a matching expected target", async () => {
    const result = await getSymbolicLinkVerificationResult(
      [{ path: validLinkPath, expectedTarget: "../canonical/shared.md" }],
      allowedDirectories,
    );

    const entry = result.entries[0];

    expect(entry?.valid).toBe(true);
    expect(entry?.resolvable).toBe(true);
    expect(entry?.actualTarget).toBe(normalize("../canonical/shared.md"));
    expect(entry?.expectedTarget).toBe("../canonical/shared.md");
    expect(result.summary).toEqual({ validCount: 1, invalidCount: 0, errorCount: 0 });
  });

  it("verifies a valid link without an expected target", async () => {
    const result = await getSymbolicLinkVerificationResult(
      [{ path: validLinkPath }],
      allowedDirectories,
    );

    expect(result.entries[0]?.valid).toBe(true);
    expect(result.entries[0]?.resolvable).toBe(true);
  });

  it("reports a target mismatch as an invalid entry with both target surfaces", async () => {
    const result = await getSymbolicLinkVerificationResult(
      [{ path: validLinkPath, expectedTarget: "../canonical/other.md" }],
      allowedDirectories,
    );

    const entry = result.entries[0];

    expect(entry?.valid).toBe(false);
    expect(entry?.resolvable).toBe(true);
    expect(entry?.actualTarget).toBe(normalize("../canonical/shared.md"));
    expect(result.summary.invalidCount).toBe(1);
  });

  it("reports a dangling link as invalid and unresolvable without an error entry", async () => {
    const result = await getSymbolicLinkVerificationResult(
      [{ path: danglingLinkPath }],
      allowedDirectories,
    );

    const entry = result.entries[0];

    expect(entry?.valid).toBe(false);
    expect(entry?.resolvable).toBe(false);
    expect(entry?.actualTarget).toBe(normalize("../canonical/missing.md"));
    expect(result.errors).toHaveLength(0);
  });

  it("reports a non-link path as invalid with a null actual target", async () => {
    const result = await getSymbolicLinkVerificationResult(
      [{ path: plainFilePath }],
      allowedDirectories,
    );

    const entry = result.entries[0];

    expect(entry?.valid).toBe(false);
    expect(entry?.actualTarget).toBeNull();
    expect(entry?.resolvable).toBe(false);
  });

  it("reports a missing path as an error entry", async () => {
    const missingLinkPath = join(sandboxRootPath, "consumers", "missing.md");

    const result = await getSymbolicLinkVerificationResult(
      [{ path: missingLinkPath, expectedTarget: "../canonical/shared.md" }],
      allowedDirectories,
    );

    expect(result.entries).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.path).toBe(missingLinkPath);
    expect(result.errors[0]?.expectedTarget).toBe("../canonical/shared.md");
    expect(result.summary.errorCount).toBe(1);
  });

  it("reports a link whose directory target escapes the allowed directories as an error", async () => {
    const outsideDirectoryPath = await mkdtemp(join(tmpdir(), "mcp-fs-verify-outside-"));
    const escapingLinkPath = join(sandboxRootPath, "consumers", "escaping");

    try {
      await symlink(outsideDirectoryPath, escapingLinkPath, "junction");

      const result = await getSymbolicLinkVerificationResult(
        [{ path: escapingLinkPath }],
        allowedDirectories,
      );

      expect(result.entries).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.error).toContain("allowed directories");
    } finally {
      await rm(outsideDirectoryPath, { recursive: true, force: true });
    }
  });

  it("preserves partial success across a mixed batch", async () => {
    const missingLinkPath = join(sandboxRootPath, "consumers", "missing.md");

    const result = await getSymbolicLinkVerificationResult(
      [
        { path: validLinkPath, expectedTarget: "../canonical/shared.md" },
        { path: danglingLinkPath },
        { path: missingLinkPath },
      ],
      allowedDirectories,
    );

    expect(result.summary).toEqual({ validCount: 1, invalidCount: 1, errorCount: 1 });
  });

  it("formats valid, invalid, and error sections in the caller-visible output", async () => {
    const missingLinkPath = join(sandboxRootPath, "consumers", "missing.md");

    const output = await handleVerifySymbolicLinks(
      [
        { path: validLinkPath, expectedTarget: "../canonical/shared.md" },
        { path: danglingLinkPath },
        { path: mismatchLinkPath, expectedTarget: "../canonical/other.md" },
        { path: plainFilePath, expectedTarget: "../canonical/shared.md" },
        { path: missingLinkPath },
      ],
      allowedDirectories,
    );

    expect(output).toContain("Symbolic Link Verification Results:");
    expect(output).toContain("✅ Valid: 1");
    expect(output).toContain("❌ Invalid: 3");
    expect(output).toContain("⚠️ Errors: 1");
    expect(output).toContain(`✓ ${validLinkPath}`);
    expect(output).toContain(`✗ ${danglingLinkPath}`);
    expect(output).toContain(`✗ ${mismatchLinkPath}`);
    expect(output).toContain(`✗ ${plainFilePath}`);
    expect(output).toContain("Expected: (not supplied)");
    expect(output).toContain("Actual:   (not a symbolic link)");
    expect(output).toContain("Resolvable: yes");
    expect(output).toContain("Resolvable: no");
    expect(output).toContain(`! ${missingLinkPath}:`);
  });

  it("formats a valid-only batch without invalid or error sections", async () => {
    const output = await handleVerifySymbolicLinks(
      [{ path: validLinkPath }],
      allowedDirectories,
    );

    expect(output).toContain("✅ Valid: 1");
    expect(output).not.toContain("\nInvalid Links:\n");
    expect(output).not.toContain("\nErrors:\n");
  });

  it("parses verification payloads through the batch schema", () => {
    const parsed = VerifySymbolicLinksArgsSchema.parse({
      links: [{ path: "consumers/shortcut.md" }],
    });

    expect(parsed.links).toEqual([{ path: "consumers/shortcut.md" }]);
    expect(parsed.links[0]?.expectedTarget).toBeUndefined();
  });

  it("rejects an empty verification batch through the schema", () => {
    expect(() => VerifySymbolicLinksArgsSchema.parse({ links: [] })).toThrow();
  });
});
