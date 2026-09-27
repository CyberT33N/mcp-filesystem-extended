import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockedGetFileSystemEntryMetadata,
  mockedValidatePath,
} = vi.hoisted(() => ({
  mockedGetFileSystemEntryMetadata: vi.fn(),
  mockedValidatePath: vi.fn(),
}));

vi.mock("@infrastructure/filesystem/filesystem-entry-metadata", () => ({
  getFileSystemEntryMetadata: mockedGetFileSystemEntryMetadata,
}));

vi.mock("@infrastructure/filesystem/path-guard", () => ({
  validatePath: mockedValidatePath,
}));

vi.mock("@domain/shared/guardrails/tool-guardrail-limits", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@domain/shared/guardrails/tool-guardrail-limits")>();

  return {
    ...actual,
    TRAVERSAL_PREFLIGHT_MAX_VISITED_DIRECTORIES: 2,
    TRAVERSAL_PREFLIGHT_MAX_VISITED_ENTRIES: 3,
  };
});

import { resolveTraversalPreflightContext } from "@domain/shared/guardrails/filesystem-preflight";

describe("filesystem preflight budget stops", () => {
  let sandboxRootPath = "";

  beforeEach(async () => {
    vi.clearAllMocks();
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-preflight-budget-stops-"));
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("stops the admission probe at the entry-breadth checkpoint without an inactive gitignore hint", async () => {
    await writeFile(join(sandboxRootPath, "a.txt"), "a", "utf8");
    await writeFile(join(sandboxRootPath, "b.txt"), "b", "utf8");
    await writeFile(join(sandboxRootPath, "c.txt"), "c", "utf8");
    await writeFile(join(sandboxRootPath, "d.txt"), "d", "utf8");

    mockedValidatePath.mockResolvedValue(sandboxRootPath);
    mockedGetFileSystemEntryMetadata.mockResolvedValue({
      size: 0,
      type: "directory",
    });

    await expect(
      resolveTraversalPreflightContext(
        "search_file_contents_by_regex",
        "root",
        [],
        [],
        false,
        [sandboxRootPath],
        ["directory"],
        true,
      ),
    ).rejects.toThrow(
      "Projected traversal entry breadth exceeds the shared preflight ceiling",
    );

    await expect(
      resolveTraversalPreflightContext(
        "search_file_contents_by_regex",
        "root",
        [],
        [],
        false,
        [sandboxRootPath],
        ["directory"],
        true,
      ),
    ).rejects.toThrow(/Preflight stopped near/u);
  });

  it("stops the admission probe at the directory-breadth checkpoint", async () => {
    await mkdir(join(sandboxRootPath, "a"), { recursive: true });
    await mkdir(join(sandboxRootPath, "b"), { recursive: true });
    await mkdir(join(sandboxRootPath, "c"), { recursive: true });

    mockedValidatePath.mockResolvedValueOnce(sandboxRootPath);
    mockedGetFileSystemEntryMetadata.mockResolvedValueOnce({
      size: 0,
      type: "directory",
    });

    await expect(
      resolveTraversalPreflightContext(
        "search_file_contents_by_regex",
        "root",
        [],
        [],
        false,
        [sandboxRootPath],
        ["directory"],
        true,
      ),
    ).rejects.toThrow(
      "Projected traversal directory breadth exceeds the shared preflight ceiling",
    );
  });

  it("rejects the admission probe when the validated traversal root cannot be read", async () => {
    mockedValidatePath.mockResolvedValueOnce(join(sandboxRootPath, "missing-root"));
    mockedGetFileSystemEntryMetadata.mockResolvedValueOnce({
      size: 0,
      type: "directory",
    });

    await expect(
      resolveTraversalPreflightContext(
        "search_file_contents_by_regex",
        "missing-root",
        [],
        [],
        false,
        [sandboxRootPath],
        ["directory"],
        true,
      ),
    ).rejects.toThrow("Request rejected during metadata preflight");
  });

  it("omits the gitignore refinement hint when the enrichment is already applied", async () => {
    await writeFile(join(sandboxRootPath, ".gitignore"), "coverage/\n", "utf8");
    await writeFile(join(sandboxRootPath, "a.txt"), "a", "utf8");
    await writeFile(join(sandboxRootPath, "b.txt"), "b", "utf8");
    await writeFile(join(sandboxRootPath, "c.txt"), "c", "utf8");
    await writeFile(join(sandboxRootPath, "d.txt"), "d", "utf8");

    mockedValidatePath.mockResolvedValueOnce(sandboxRootPath);
    mockedGetFileSystemEntryMetadata.mockResolvedValueOnce({
      size: 0,
      type: "directory",
    });

    await expect(
      resolveTraversalPreflightContext(
        "search_file_contents_by_regex",
        "root",
        [],
        [],
        true,
        [sandboxRootPath],
        ["directory"],
        true,
      ),
    ).rejects.toThrow(/Projected traversal entry breadth exceeds(?![\s\S]*respectGitIgnore=true)/u);
  });
});
