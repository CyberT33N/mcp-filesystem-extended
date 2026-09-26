import { lstat, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleCreateSymbolicLinks } from "@domain/mutation/create-symbolic-links/handler";
import { CreateSymbolicLinksArgsSchema } from "@domain/mutation/create-symbolic-links/schema";

const createErrnoError = (code: string, message: string): NodeJS.ErrnoException =>
  Object.assign(new Error(message), { code });

/**
 * Asserts the stored link target against the platform-owned separator form.
 *
 * @remarks
 * Windows stores link targets with normalized backslash separators even when
 * the link was created with forward slashes, so the assertion compares the
 * platform-normalized path identity instead of the raw byte form.
 */
const expectStoredTarget = async (linkPath: string, expectedTarget: string): Promise<void> => {
  expect(await readlink(linkPath)).toBe(normalize(expectedTarget));
};

describe("create_symbolic_links", () => {
  let sandboxRootPath = "";
  let allowedDirectories: string[] = [];
  let targetFilePath = "";
  let targetDirectoryPath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-create-symbolic-links-"));
    allowedDirectories = [sandboxRootPath];
    targetFilePath = join(sandboxRootPath, "canonical", "shared.md");
    targetDirectoryPath = join(sandboxRootPath, "canonical");

    await mkdir(targetDirectoryPath, { recursive: true });
    await writeFile(targetFilePath, "shared content", "utf8");
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("creates a relative file link and stores the target verbatim", async () => {
    const linkPath = join(sandboxRootPath, "consumers", "shortcut.md");

    const output = await handleCreateSymbolicLinks(
      [{ linkPath, target: "../canonical/shared.md" }],
      allowedDirectories,
    );

    expect(output).toContain("processed successfully");
    await expectStoredTarget(linkPath, "../canonical/shared.md");
    expect((await lstat(linkPath)).isSymbolicLink()).toBe(true);
  });

  it("creates a directory link with an explicit dir type", async () => {
    const linkPath = join(sandboxRootPath, "consumers", "canonical-link");

    const output = await handleCreateSymbolicLinks(
      [{ linkPath, target: targetDirectoryPath, type: "dir" }],
      allowedDirectories,
    );

    expect(output).toContain("processed successfully");
    expect((await lstat(linkPath)).isSymbolicLink()).toBe(true);
  });

  it("creates a junction through the documented type variant", async () => {
    const linkPath = join(sandboxRootPath, "consumers", "canonical-junction");

    const output = await handleCreateSymbolicLinks(
      [{ linkPath, target: targetDirectoryPath, type: "junction" }],
      allowedDirectories,
    );

    expect(output).toContain("processed successfully");
    expect((await lstat(linkPath)).isSymbolicLink()).toBe(true);
  });

  it("creates a dangling link when the target does not exist yet", async () => {
    const linkPath = join(sandboxRootPath, "consumers", "future.md");

    const output = await handleCreateSymbolicLinks(
      [{ linkPath, target: "../canonical/future.md" }],
      allowedDirectories,
    );

    expect(output).toContain("processed successfully");
    await expectStoredTarget(linkPath, "../canonical/future.md");
  });

  it("refuses to create over an existing file at the link path", async () => {
    const output = await handleCreateSymbolicLinks(
      [{ linkPath: targetFilePath, target: "../canonical/other.md" }],
      allowedDirectories,
    );

    expect(output).toContain("Link path already exists");
    expect(await readFile(targetFilePath, "utf8")).toBe("shared content");
  });

  it("refuses to create over an existing dangling link at the link path", async () => {
    const linkPath = join(sandboxRootPath, "consumers", "dangling.md");
    await mkdir(join(sandboxRootPath, "consumers"), { recursive: true });
    await symlink("../canonical/missing.md", linkPath);

    const output = await handleCreateSymbolicLinks(
      [{ linkPath, target: "../canonical/shared.md" }],
      allowedDirectories,
    );

    expect(output).toContain("Link path already exists");
    await expectStoredTarget(linkPath, "../canonical/missing.md");
  });

  it("refuses a relative target that escapes the allowed directories", async () => {
    const linkPath = join(sandboxRootPath, "consumers", "escape.md");

    const output = await handleCreateSymbolicLinks(
      [{ linkPath, target: "../../outside.md" }],
      allowedDirectories,
    );

    expect(output).toContain("Failed to create symbolic link");
    expect(output).toContain("outside allowed directories");
  });

  it("maps an EPERM denial to the deterministic privilege failure family", async () => {
    const linkPath = join(sandboxRootPath, "consumers", "denied.md");
    vi.spyOn(fs, "symlink").mockRejectedValueOnce(
      createErrnoError("EPERM", "operation not permitted"),
    );

    const output = await handleCreateSymbolicLinks(
      [{ linkPath, target: "../canonical/shared.md" }],
      allowedDirectories,
    );

    expect(output).toContain("symlink_privilege_missing");
    expect(output).toContain("Developer Mode");
    expect(output).toContain("junction");
  });

  it("keeps a non-EPERM inspection failure as a plain per-entry error", async () => {
    const linkPath = join(sandboxRootPath, "consumers", "unreadable.md");
    vi.spyOn(fs, "lstat").mockRejectedValueOnce(
      createErrnoError("EACCES", "permission denied"),
    );

    const output = await handleCreateSymbolicLinks(
      [{ linkPath, target: "../canonical/shared.md" }],
      allowedDirectories,
    );

    expect(output).toContain("Failed to create symbolic link");
    expect(output).toContain("permission denied");
    expect(output).not.toContain("symlink_privilege_missing");
  });

  it("preserves partial success across a mixed batch", async () => {
    const successfulLinkPath = join(sandboxRootPath, "consumers", "ok.md");

    const output = await handleCreateSymbolicLinks(
      [
        { linkPath: successfulLinkPath, target: "../canonical/shared.md" },
        { linkPath: targetFilePath, target: "../canonical/other.md" },
      ],
      allowedDirectories,
    );

    expect(output).toContain("1 symbolic links processed successfully");
    expect(output).toContain("1 symbolic links failed");
    expect((await lstat(successfulLinkPath)).isSymbolicLink()).toBe(true);
  });

  it("refuses batches beyond the shared path-mutation operation ceiling", async () => {
    const links = Array.from({ length: 201 }, (_, index) => ({
      linkPath: join(sandboxRootPath, `link-${index}.md`),
      target: "../canonical/shared.md",
    }));

    await expect(handleCreateSymbolicLinks(links, allowedDirectories)).rejects.toThrow(
      "create_symbolic_links",
    );
  });

  it("parses link creation payloads through the batch schema", () => {
    const parsed = CreateSymbolicLinksArgsSchema.parse({
      links: [{ linkPath: "consumers/shortcut.md", target: "../canonical/shared.md" }],
    });

    expect(parsed.links).toEqual([
      { linkPath: "consumers/shortcut.md", target: "../canonical/shared.md" },
    ]);
  });

  it("accepts the documented junction type value through the schema", () => {
    const parsed = CreateSymbolicLinksArgsSchema.parse({
      links: [
        {
          linkPath: "consumers/canonical",
          target: "C:/Projects/app/canonical",
          type: "junction",
        },
      ],
    });

    expect(parsed.links[0]?.type).toBe("junction");
  });

  it("rejects an empty link batch through the schema", () => {
    expect(() => CreateSymbolicLinksArgsSchema.parse({ links: [] })).toThrow();
  });
});
